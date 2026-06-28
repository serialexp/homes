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
import { getRedisValue, setRedisValue } from "./redis.server.js";

export type ReconcileMode =
  | "reconcile"
  | "reconcile-apply"
  | "merge"
  | "merge-apply";

export interface ReconcileSummary {
  phase: "reconcile";
  total: number;
  countsByKind: Record<string, number>;
  matched: number;
  changed: number;
  busCleared: number;
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
  summary?: ReconcileSummary | MergeSummary;
}

const STATUS_KEY = "reconcile:lines:status";

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

  const apply = mode === "reconcile-apply";
  const summary = await reconcileAllLines(prisma, { apply, limit, onProgress });
  await writeStatus({
    status: "completed",
    mode,
    message: `${summary.matched}/${summary.total} matched to a canonical line` +
      (apply
        ? `, ${summary.changed} row(s) updated, ${summary.busCleared} bus name(s) cleared`
        : " (dry-run, nothing written)"),
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
 * Reconcile every train_line row. Pure of Redis/UI concerns — progress is
 * surfaced via the callback so both the admin job and the CLI can reuse it.
 */
export async function reconcileAllLines(
  db: PrismaClient,
  opts: { apply: boolean; limit?: number | null; onProgress?: ProgressFn }
): Promise<ReconcileSummary> {
  const { apply, limit = null, onProgress } = opts;

  const rows = await db.trainLine.findMany({
    orderBy: { id: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  const countsByKind: Record<string, number> = {};
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
    if (kindChanged || canonChanged || clearBusName) changed++;
    if (clearBusName) busCleared++;

    if (apply) {
      await db.trainLine.update({
        where: { id: row.id },
        data: {
          kind: r.kind,
          canonical_id: r.canonical_id,
          canonical_name: r.canonical_name,
          ...(clearBusName ? { translated_name: null } : {}),
        },
      });
    }

    await onProgress?.(
      i,
      rows.length,
      `Reconciling ${i}/${rows.length}: ${row.name} → ${r.kind}`
    );
  }

  return {
    phase: "reconcile",
    total: rows.length,
    countsByKind,
    matched,
    changed,
    busCleared,
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
