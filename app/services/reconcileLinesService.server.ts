/**
 * Reconcile `train_line` rows against the canonical rail dataset, runnable from
 * the admin UI (no CLI/prod-shell access required). Mirrors the retrieval
 * service: a single background job whose progress lives in Redis so the admin
 * page can poll it.
 *
 * Two phases, each available as a dry-run or an apply:
 *  - reconcile: classify every row (rail/subway/.../bus) and match rail lines to
 *    a canonical line. On apply, bus rows also get their stale (often
 *    hallucinated) `translated_name` cleared so the UI falls back to the raw
 *    Japanese label.
 *  - merge: collapse duplicate rail rows sharing a `canonical_id` onto one
 *    survivor, re-pointing stations. Destructive; apply is gated.
 *
 * The core functions take a PrismaClient + progress callback so the standalone
 * CLI (src/scripts/reconcileTrainLines.ts) shares exactly this logic.
 */
import type { PrismaClient } from "@prisma/client";
import prisma from "../utils/db.server.js";
import { reconcileTrainLine } from "../utils/llm.server.js";
import { clearRedisValue, getRedisValue, setRedisValue } from "./redis.server.js";

export type ReconcileMode =
  | "reconcile"
  | "apply-stored"
  | "merge"
  | "merge-apply";

export interface ReconcileSummary {
  phase: "reconcile";
  total: number;
  countsByKind: Record<string, number>;
  matched: number;
  changed: number;
  busCleared: number;
  /** How many per-line proposals were stored for review/apply. */
  proposalCount: number;
}

export interface ApplySummary {
  phase: "apply";
  total: number;
  applied: number;
  busCleared: number;
  skipped: number;
}

export interface MergeSummary {
  phase: "merge";
  groups: number;
  rowsDeleted: number;
  plan: string[];
}

export interface ReconcileJobStatus {
  status: "idle" | "running" | "completed" | "failed";
  mode: ReconcileMode;
  message: string;
  processed: number;
  total: number;
  startTime: string;
  endTime?: string;
  error?: string;
  summary?: ReconcileSummary | ApplySummary | MergeSummary;
}

/**
 * One proposed change for a single train_line row, produced by a dry run and
 * persisted so an apply can write exactly what was previewed (instead of
 * re-running the non-deterministic LLM).
 */
export interface LineProposal {
  id: number;
  name: string;
  region: string | null;
  oldKind: string;
  newKind: string;
  oldCanonicalId: string | null;
  newCanonicalId: string | null;
  newCanonicalName: string | null;
  oldTranslatedName: string | null;
  /** Clear the stale (often hallucinated) romaji on a bus row. */
  clearBusName: boolean;
  /** True if applying this proposal would change the row. */
  changed: boolean;
}

const STATUS_KEY = "reconcile:lines:status";
const PROPOSALS_KEY = "reconcile:lines:proposals";

interface StoredProposals {
  generatedAt: string;
  proposals: LineProposal[];
}

export async function storeProposals(proposals: LineProposal[]): Promise<void> {
  const payload: StoredProposals = {
    generatedAt: new Date().toISOString(),
    proposals,
  };
  await setRedisValue(PROPOSALS_KEY, JSON.stringify(payload), 86400);
}

export async function getStoredProposals(): Promise<LineProposal[] | null> {
  const raw = await getRedisValue(PROPOSALS_KEY);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as StoredProposals).proposals;
  } catch {
    return null;
  }
}

export async function clearStoredProposals(): Promise<void> {
  await clearRedisValue(PROPOSALS_KEY);
}

export async function getReconcileJobStatus(): Promise<ReconcileJobStatus | null> {
  const raw = await getRedisValue(STATUS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReconcileJobStatus;
  } catch {
    return null;
  }
}

async function writeStatus(status: ReconcileJobStatus): Promise<void> {
  // Expire after a day so a stale terminal status doesn't linger forever.
  await setRedisValue(STATUS_KEY, JSON.stringify(status), 86400);
}

export async function resetReconcileJobStatus(): Promise<void> {
  await clearStoredProposals();
  await writeStatus({
    status: "idle",
    mode: "reconcile",
    message: "Status reset by admin",
    processed: 0,
    total: 0,
    startTime: new Date().toISOString(),
  });
}

/**
 * Kick off a reconcile/merge job in the background. Returns immediately; poll
 * getReconcileJobStatus() for progress. Throws if a job is already running.
 */
export async function startReconcileJob(
  mode: ReconcileMode,
  limit: number | null = null
): Promise<void> {
  const current = await getReconcileJobStatus();
  if (current && current.status === "running") {
    throw new Error("A reconcile job is already running");
  }

  const startTime = new Date().toISOString();
  await writeStatus({
    status: "running",
    mode,
    message: "Starting…",
    processed: 0,
    total: 0,
    startTime,
  });

  // Fire-and-forget; errors are captured into the status.
  void executeJob(mode, limit, startTime).catch(async (error) => {
    console.error("Reconcile job error:", error);
    await writeStatus({
      status: "failed",
      mode,
      message: "Job failed",
      processed: 0,
      total: 0,
      startTime,
      endTime: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function executeJob(
  mode: ReconcileMode,
  limit: number | null,
  startTime: string
): Promise<void> {
  let lastWrite = 0;
  const onProgress = async (processed: number, total: number, message: string) => {
    const now = Date.now();
    // Throttle Redis writes to ~1/sec (always write the final 100%).
    if (now - lastWrite < 1000 && processed < total) return;
    lastWrite = now;
    await writeStatus({
      status: "running",
      mode,
      message,
      processed,
      total,
      startTime,
    });
  };

  if (mode === "merge" || mode === "merge-apply") {
    const summary = await mergeCanonicalDuplicates(prisma, {
      apply: mode === "merge-apply",
      onProgress,
    });
    await writeStatus({
      status: "completed",
      mode,
      message:
        mode === "merge-apply"
          ? `Merged ${summary.rowsDeleted} duplicate row(s) across ${summary.groups} group(s)`
          : `${summary.groups} group(s) with duplicates, ${summary.rowsDeleted} row(s) would be merged (dry-run)`,
      processed: summary.groups,
      total: summary.groups,
      startTime,
      endTime: new Date().toISOString(),
      summary,
    });
    return;
  }

  if (mode === "apply-stored") {
    const proposals = await getStoredProposals();
    if (!proposals || proposals.length === 0) {
      await writeStatus({
        status: "failed",
        mode,
        message: "No previewed results to apply — run a dry run first.",
        processed: 0,
        total: 0,
        startTime,
        endTime: new Date().toISOString(),
        error: "No stored proposals",
      });
      return;
    }
    const summary = await applyProposals(prisma, proposals, { onProgress });
    // Clear so a stale set can't be applied twice.
    await clearStoredProposals();
    await writeStatus({
      status: "completed",
      mode,
      message:
        `Applied ${summary.applied} change(s), ${summary.busCleared} bus name(s) cleared` +
        (summary.skipped ? `, ${summary.skipped} skipped (row gone)` : ""),
      processed: summary.total,
      total: summary.total,
      startTime,
      endTime: new Date().toISOString(),
      summary,
    });
    return;
  }

  // Dry run: classify every row, persist the proposals for review/apply.
  const { summary, proposals } = await reconcileAllLines(prisma, {
    limit,
    onProgress,
  });
  await storeProposals(proposals);
  await writeStatus({
    status: "completed",
    mode,
    message:
      `${summary.matched}/${summary.total} matched to a canonical line; ` +
      `${summary.changed} row(s) would change (dry-run, nothing written)`,
    processed: summary.total,
    total: summary.total,
    startTime,
    endTime: new Date().toISOString(),
    summary,
  });
}

type ProgressFn = (
  processed: number,
  total: number,
  message: string
) => void | Promise<void>;

/**
 * Reconcile every train_line row (dry-run): classify + match each row via the
 * LLM and build a per-row proposal, WITHOUT writing anything. Progress is
 * surfaced via the callback so both the admin job and the CLI can reuse it.
 * The caller persists `proposals` and later feeds them to applyProposals(), so
 * the apply writes exactly what was previewed.
 */
export async function reconcileAllLines(
  db: PrismaClient,
  opts: { limit?: number | null; onProgress?: ProgressFn }
): Promise<{ summary: ReconcileSummary; proposals: LineProposal[] }> {
  const { limit = null, onProgress } = opts;

  const rows = await db.trainLine.findMany({
    orderBy: { id: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  const countsByKind: Record<string, number> = {};
  const proposals: LineProposal[] = [];
  let matched = 0;
  let changed = 0;
  let busCleared = 0;
  let i = 0;

  for (const row of rows) {
    i++;
    const r = await reconcileTrainLine(row.name, row.region ?? undefined);
    countsByKind[r.kind] = (countsByKind[r.kind] ?? 0) + 1;
    if (r.canonical_id) matched++;

    const kindChanged = row.kind !== r.kind;
    const canonChanged = (row.canonical_id ?? null) !== r.canonical_id;
    // Clear stale hallucinated romaji on bus rows so the UI shows the raw label.
    const clearBusName = r.kind === "bus" && row.translated_name != null;
    const rowChanged = kindChanged || canonChanged || clearBusName;
    if (rowChanged) changed++;
    if (clearBusName) busCleared++;

    proposals.push({
      id: row.id,
      name: row.name,
      region: row.region ?? null,
      oldKind: row.kind,
      newKind: r.kind,
      oldCanonicalId: row.canonical_id ?? null,
      newCanonicalId: r.canonical_id,
      newCanonicalName: r.canonical_name,
      oldTranslatedName: row.translated_name ?? null,
      clearBusName,
      changed: rowChanged,
    });

    await onProgress?.(
      i,
      rows.length,
      `Reconciling ${i}/${rows.length}: ${row.name} → ${r.kind}`
    );
  }

  return {
    summary: {
      phase: "reconcile",
      total: rows.length,
      countsByKind,
      matched,
      changed,
      busCleared,
      proposalCount: proposals.length,
    },
    proposals,
  };
}

/**
 * Apply a previously-computed set of proposals — no LLM calls, so the result is
 * exactly what was previewed. A row that has since been deleted is skipped
 * rather than failing the whole batch.
 */
export async function applyProposals(
  db: PrismaClient,
  proposals: LineProposal[],
  opts: { onProgress?: ProgressFn } = {}
): Promise<ApplySummary> {
  const { onProgress } = opts;
  let applied = 0;
  let busCleared = 0;
  let skipped = 0;
  let i = 0;

  for (const p of proposals) {
    i++;
    if (!p.changed) {
      await onProgress?.(i, proposals.length, `Skipping unchanged ${p.name}`);
      continue;
    }
    try {
      await db.trainLine.update({
        where: { id: p.id },
        data: {
          kind: p.newKind,
          canonical_id: p.newCanonicalId,
          canonical_name: p.newCanonicalName,
          ...(p.clearBusName ? { translated_name: null } : {}),
        },
      });
      applied++;
      if (p.clearBusName) busCleared++;
    } catch (error) {
      // Most likely the row was deleted (e.g. by a merge) since the dry run.
      console.warn(`Skipping proposal for train_line #${p.id} (${p.name}):`, error);
      skipped++;
    }
    await onProgress?.(
      i,
      proposals.length,
      `Applying ${i}/${proposals.length}: ${p.name} → ${p.newKind}`
    );
  }

  return {
    phase: "apply",
    total: proposals.length,
    applied,
    busCleared,
    skipped,
  };
}

/**
 * Merge rail rows sharing a canonical_id onto a single survivor, re-pointing
 * their stations (and the buildings linked to those stations) and deleting the
 * duplicate rows. Dry-run unless `apply`.
 */
export async function mergeCanonicalDuplicates(
  db: PrismaClient,
  opts: { apply: boolean; onProgress?: ProgressFn }
): Promise<MergeSummary> {
  const { apply, onProgress } = opts;

  const rows = await db.trainLine.findMany({
    where: { canonical_id: { not: null } },
    include: { _count: { select: { stations: true } } },
    orderBy: { id: "asc" },
  });

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.canonical_id as string;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const dupGroups = [...groups.entries()].filter(([, g]) => g.length > 1);
  const plan: string[] = [];
  let rowsDeleted = 0;
  let processed = 0;

  for (const [canonicalId, group] of dupGroups) {
    // Survivor: row whose name equals the canonical name, else most stations,
    // else lowest id. Deterministic.
    const survivor = [...group].sort(
      (a, b) =>
        (b.canonical_name === b.name ? 1 : 0) -
          (a.canonical_name === a.name ? 1 : 0) ||
        b._count.stations - a._count.stations ||
        a.id - b.id
    )[0];
    const dups = group.filter((g) => g.id !== survivor.id);
    rowsDeleted += dups.length;

    plan.push(
      `canonical ${canonicalId} (${survivor.canonical_name ?? "?"}): keep #${survivor.id} "${survivor.name}", merge ${dups
        .map((d) => `#${d.id} "${d.name}"`)
        .join(", ")}`
    );

    if (apply) {
      await db.$transaction(async (tx) => {
        for (const dup of dups) {
          const dupStations = await tx.station.findMany({
            where: { train_line_id: dup.id },
          });
          for (const st of dupStations) {
            const clash = await tx.station.findFirst({
              where: { name: st.name, train_line_id: survivor.id },
            });
            if (clash) {
              // Move building links onto the surviving station, respecting the
              // (building_id, station_id) unique constraint.
              const links = await tx.buildingStation.findMany({
                where: { station_id: st.id },
              });
              for (const link of links) {
                const exists = await tx.buildingStation.findUnique({
                  where: {
                    building_id_station_id: {
                      building_id: link.building_id,
                      station_id: clash.id,
                    },
                  },
                });
                if (exists) {
                  await tx.buildingStation.delete({ where: { id: link.id } });
                } else {
                  await tx.buildingStation.update({
                    where: { id: link.id },
                    data: { station_id: clash.id },
                  });
                }
              }
              await tx.station.delete({ where: { id: st.id } });
            } else {
              await tx.station.update({
                where: { id: st.id },
                data: { train_line_id: survivor.id },
              });
            }
          }
          await tx.trainLine.delete({ where: { id: dup.id } });
        }
      });
    }

    processed++;
    await onProgress?.(
      processed,
      dupGroups.length,
      `Merging group ${processed}/${dupGroups.length}: ${survivor.canonical_name ?? canonicalId}`
    );
  }

  return { phase: "merge", groups: dupGroups.length, rowsDeleted, plan };
}
