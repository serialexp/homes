import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useRevalidator,
  useSubmit,
} from "@remix-run/react";
import { useEffect } from "react";
import {
  getReconcileJobStatus,
  getStoredProposals,
  resetReconcileJobStatus,
  startReconcileJob,
  type ApplySummary,
  type LineProposal,
  type ReconcileJobStatus,
  type ReconcileMode,
  type ReconcileSummary,
  type MergeSummary,
} from "../services/reconcileLinesService.server.js";
import {
  BUTTON_DANGER_SOLID,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  INPUT,
  LABEL,
  PageHeader,
  PANEL,
  StatusPill,
} from "../components/AdminUi.js";
import { Pagination } from "../components/Pagination.js";
import { proposalPage, type ProposalPage } from "../utils/proposalPage.js";

/** Proposal rows per page on the review table. */
const PROPOSALS_PER_PAGE = 50;

export async function loader({ request }: LoaderFunctionArgs) {
  const status = await getReconcileJobStatus();
  // Only load the proposals once a dry run has completed, and send one page of them:
  // the table shows a page at a time, and the page is not re-sent on every running-state poll.
  let proposals: ProposalPage<LineProposal> | null = null;
  if (status?.status === "completed" && status.mode === "reconcile") {
    const stored = await getStoredProposals();
    if (stored) {
      const requested = Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10);
      proposals = proposalPage(stored, requested, PROPOSALS_PER_PAGE);
    }
  }
  return json({ status, proposals });
}

const VALID_MODES: ReconcileMode[] = [
  "reconcile",
  "apply-stored",
  "merge",
  "merge-apply",
];

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const action = formData.get("_action") as string;

  if (action === "reset") {
    await resetReconcileJobStatus();
    return json({ success: true, message: "Status reset to idle" });
  }

  if (!VALID_MODES.includes(action as ReconcileMode)) {
    return json({ success: false, message: "Unknown action" }, { status: 400 });
  }

  const limitRaw = formData.get("limit") as string | null;
  const limit = limitRaw && limitRaw.trim() ? parseInt(limitRaw, 10) : null;

  try {
    await startReconcileJob(
      action as ReconcileMode,
      Number.isFinite(limit as number) ? limit : null
    );
    return json({ success: true, message: "Reconcile job started" });
  } catch (error) {
    return json(
      {
        success: false,
        message: error instanceof Error ? error.message : "An error occurred",
      },
      { status: 400 }
    );
  }
}

function isReconcileSummary(
  s: ReconcileJobStatus["summary"]
): s is ReconcileSummary {
  return !!s && s.phase === "reconcile";
}
function isApplySummary(s: ReconcileJobStatus["summary"]): s is ApplySummary {
  return !!s && s.phase === "apply";
}
function isMergeSummary(s: ReconcileJobStatus["summary"]): s is MergeSummary {
  return !!s && s.phase === "merge";
}

function KindPill({ kind }: { kind: string }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md bg-base-200 px-2 py-0.5 text-xs font-medium text-base-content/80">
      {kind}
    </span>
  );
}

const HEAD_CELL = "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-base-content/70";

export default function ReconcilePage() {
  const { status, proposals } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const revalidator = useRevalidator();

  const running = status?.status === "running";

  // Poll while a job is running by revalidating the loader (re-reads Redis
  // status, and pulls in proposals once the dry run completes).
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 2000);
    return () => clearInterval(interval);
  }, [running, revalidator]);

  const run = (mode: ReconcileMode) => {
    const fd = new FormData();
    fd.append("_action", mode);
    const limitEl = document.getElementById("limit") as HTMLInputElement | null;
    if (limitEl?.value.trim()) fd.append("limit", limitEl.value.trim());
    submit(fd, { method: "post" });
  };
  const reset = () => {
    const fd = new FormData();
    fd.append("_action", "reset");
    submit(fd, { method: "post" });
  };

  const pct =
    status && status.total > 0
      ? Math.round((status.processed / status.total) * 100)
      : 0;

  const changedCount = proposals?.changedTotal ?? 0;
  const shownFrom = proposals ? (proposals.currentPage - 1) * PROPOSALS_PER_PAGE + 1 : 0;
  const shownTo = proposals ? Math.min(proposals.currentPage * PROPOSALS_PER_PAGE, proposals.total) : 0;
  const hasApplyable = changedCount > 0;

  const applyChanges = () => {
    if (
      confirm(
        `Apply ${changedCount} previewed change(s) to the train_line table? This writes exactly what is shown below.`
      )
    ) {
      run("apply-stored");
    }
  };

  return (
    <>
      <PageHeader
        title="Train Line Reconciliation"
        description={
          <>
            A <strong>Dry run</strong> classifies each <code className="rounded bg-base-200 px-1 py-0.5 font-mono text-[13px]">train_line</code> row
            (rail / subway / tram / monorail / shinkansen / bus), matches railway
            lines to the bundled canonical dataset, and stores the proposed changes
            for review — it writes nothing. Review the table, then{" "}
            <strong>Apply</strong> writes exactly those proposals (no second LLM
            call, so what you see is what you get). Each dry run makes one LLM call
            per line, so it can take a few minutes.
          </>
        }
      />

      {actionData && (
        <p
          role="status"
          className={`m-0 rounded-field px-3.5 py-2.5 text-sm font-medium ${
            actionData.success ? "bg-success/10 text-success" : "bg-error/10 text-error"
          }`}
        >
          {actionData.message}
        </p>
      )}

      {/* Workflow */}
      <section aria-label="Reconcile workflow" className={`${PANEL} overflow-hidden`}>
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] p-0">
          <li className="flex flex-col gap-3 border-b border-base-300/60 p-5 md:border-b-0 md:border-r">
            <span className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full border-2 border-primary font-semibold text-primary">1</span>
              <span className="font-semibold">Dry run</span>
            </span>
            <span className="text-sm text-base-content/70">
              Classifies every row and stores the proposals. Writes nothing.
            </span>
            <div className="mt-auto flex flex-wrap items-end gap-2 pt-1">
              <div className="flex flex-col gap-1">
                <label htmlFor="limit" className={LABEL}>Limit to first N rows</label>
                <input
                  id="limit"
                  type="number"
                  min="1"
                  placeholder="All rows"
                  disabled={running}
                  className={`${INPUT} w-32`}
                />
              </div>
              <button
                type="button"
                onClick={() => run("reconcile")}
                disabled={running}
                className={BUTTON_PRIMARY}
              >
                Dry run
              </button>
            </div>
          </li>
          <li
            aria-current={proposals && proposals.total > 0 ? "step" : undefined}
            className={`flex flex-col gap-3 border-b border-base-300/60 p-5 md:border-b-0 md:border-r ${
              proposals && proposals.total > 0 ? "bg-base-200/60" : ""
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full border-2 border-primary font-semibold text-primary">2</span>
              <span className="font-semibold">Review</span>
            </span>
            <span className="text-sm text-base-content/70">
              {proposals && proposals.total > 0
                ? `${changedCount} of ${proposals.total} rows would change. Check them in the table below.`
                : "Review the stored proposals once a dry run has completed."}
            </span>
          </li>
          <li className="flex flex-col gap-3 p-5">
            <span className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full border-2 border-base-300 font-semibold text-base-content/70">3</span>
              <span className="font-semibold">Apply</span>
            </span>
            <span className="text-sm text-base-content/70">
              Writes the stored proposals. No second LLM call.
            </span>
            <button
              type="button"
              onClick={applyChanges}
              disabled={running || !hasApplyable}
              className={`${BUTTON_PRIMARY} mt-auto self-start`}
            >
              Apply {changedCount} {changedCount === 1 ? "change" : "changes"}
            </button>
          </li>
        </ol>
      </section>

      {running && (
        <p role="status" className="m-0 rounded-field bg-info/10 px-3.5 py-2.5 text-sm font-medium text-info">
          A job is running — buttons are disabled until it finishes.
        </p>
      )}

      {/* Status */}
      {status && status.status !== "idle" && (
        <section aria-labelledby="status-h" className={`${PANEL} flex flex-col gap-5 p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="status-h" className="m-0 text-lg font-semibold">Job status</h2>
              <StatusPill status={status.status} />
              <span className="text-sm text-base-content/60">({status.mode})</span>
            </div>
            {status.total > 0 && (
              <span className="font-display text-2xl font-bold tabular-nums">{pct}%</span>
            )}
          </div>

          {status.total > 0 && (
            <div role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2.5 overflow-hidden rounded-full bg-base-300">
              <div
                className={`h-2.5 rounded-full ${status.status === "failed" ? "bg-error" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          <div className="grid gap-2 text-sm">
            <p className="m-0"><span className="font-medium">Message:</span> {status.message}</p>
            <p className="m-0 tabular-nums"><span className="font-medium">Progress:</span> {status.processed} / {status.total}</p>
            {status.error && (
              <p role="alert" className="m-0 rounded-field bg-error/10 px-3.5 py-2.5 font-medium text-error">
                Error: {status.error}
              </p>
            )}
          </div>

          {/* Summary */}
          {isReconcileSummary(status.summary) && (
            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
              <div className="flex flex-col gap-1 rounded-field border border-base-300 p-4">
                <dt className="text-sm text-base-content/70">Canonical matches</dt>
                <dd className="m-0 font-display text-2xl font-bold tabular-nums">
                  {status.summary.matched} <span className="text-base font-medium text-base-content/60">/ {status.summary.total}</span>
                </dd>
              </div>
              <div className="flex flex-col gap-1 rounded-field border border-base-300 p-4">
                <dt className="text-sm text-base-content/70">Rows that would change</dt>
                <dd className="m-0 font-display text-2xl font-bold tabular-nums">{status.summary.changed}</dd>
              </div>
              <div className="flex flex-col gap-1 rounded-field border border-base-300 p-4">
                <dt className="text-sm text-base-content/70">Bus names to clear</dt>
                <dd className="m-0 font-display text-2xl font-bold tabular-nums">{status.summary.busCleared}</dd>
              </div>
              <div className="flex flex-col gap-1 rounded-field border border-base-300 p-4">
                <dt className="text-sm text-base-content/70">By kind</dt>
                <dd className="m-0 flex flex-wrap gap-x-2.5 gap-y-1 text-sm tabular-nums">
                  {Object.entries(status.summary.countsByKind).map(([k, v]) => (
                    <span key={k}><strong className="font-semibold">{v}</strong> {k}</span>
                  ))}
                </dd>
              </div>
            </dl>
          )}
          {isApplySummary(status.summary) && (
            <div className="grid gap-2 text-sm md:grid-cols-3">
              <p className="m-0"><span className="font-medium">Applied:</span> {status.summary.applied}</p>
              <p className="m-0"><span className="font-medium">Bus names cleared:</span> {status.summary.busCleared}</p>
              <p className="m-0"><span className="font-medium">Skipped:</span> {status.summary.skipped}</p>
            </div>
          )}
          {isMergeSummary(status.summary) && (
            <div className="text-sm">
              <p className="m-0">
                <span className="font-medium">Duplicate groups:</span>{" "}
                {status.summary.groups} —{" "}
                <span className="font-medium">rows to delete:</span>{" "}
                {status.summary.rowsDeleted}
              </p>
              {status.summary.plan.length > 0 && (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-field bg-base-200 p-3 text-xs">
                  {status.summary.plan.join("\n")}
                </pre>
              )}
            </div>
          )}

          {status.status !== "running" && (
            <div>
              <button type="button" onClick={reset} className={BUTTON_SECONDARY}>
                Clear status
              </button>
            </div>
          )}
        </section>
      )}

      {/* Proposal preview (after a completed dry run) */}
      {proposals && proposals.total > 0 && (
        <section aria-labelledby="prev-h" className={`${PANEL} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-5 py-4">
            <h2 id="prev-h" className="m-0 text-lg font-semibold">
              Proposed changes{" "}
              <span className="font-medium tabular-nums text-base-content/60">
                — {changedCount} of {proposals.total} rows would change
              </span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-base-200/60">
                <tr className="text-left">
                  <th scope="col" className={HEAD_CELL}>Line (raw)</th>
                  <th scope="col" className={HEAD_CELL}>Region</th>
                  <th scope="col" className={HEAD_CELL}>Kind</th>
                  <th scope="col" className={HEAD_CELL}>Canonical match</th>
                  <th scope="col" className={HEAD_CELL}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {proposals.rows.map((p: LineProposal) => (
                    <tr
                      key={p.id}
                      className={`border-t border-base-300/60 ${p.changed ? "bg-warning/5" : "opacity-60"}`}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium">{p.name}</td>
                      <td className="px-4 py-2.5 text-base-content/80">{p.region ?? "-"}</td>
                      <td className="px-4 py-2.5">
                        {p.oldKind === p.newKind ? (
                          <KindPill kind={p.newKind} />
                        ) : (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-base-200 px-2 py-0.5 text-xs font-medium text-base-content/60 line-through">{p.oldKind}</span>
                            <span aria-hidden="true" className="text-base-content/60">→</span>
                            <KindPill kind={p.newKind} />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.newCanonicalName ?? (
                          <span className="text-base-content/60">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.clearBusName && (
                          <span className="whitespace-nowrap rounded-md bg-[#FBF0D9] px-2 py-0.5 text-xs font-semibold text-[#6E4400]">
                            clear stale name
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-base-300 px-5 py-4">
            <Pagination
              currentPage={proposals.currentPage}
              totalPages={proposals.totalPages}
              summary={`Showing ${shownFrom}–${shownTo} of ${proposals.total}`}
              pageHref={(page) => (page <= 1 ? "?" : `?page=${page}`)}
            />
          </div>
        </section>
      )}

      {/* Merge duplicates */}
      <section aria-labelledby="merge-h" className={`${PANEL} overflow-hidden border-error/30`}>
        <div className="flex flex-col gap-2 p-5">
          <h2 id="merge-h" className="m-0 text-lg font-semibold">
            Merge duplicates{" "}
            <span className="text-sm font-normal text-base-content/60">
              (run reconcile + apply first so canonical ids are populated)
            </span>
          </h2>
          <p className="m-0 max-w-3xl text-base-content/80">
            Groups rail rows that share a canonical line, keeps one, re-points its stations and deletes the rest.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-error/30 bg-error/5 px-5 py-4">
          <span className="flex items-center gap-2 text-sm font-medium text-error">
            Applying a merge deletes rows and can&apos;t be undone.
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run("merge")}
              disabled={running}
              className={BUTTON_SECONDARY}
            >
              Preview merge
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "Merge duplicate rail rows? This deletes duplicate train_line rows and re-points their stations. This cannot be undone."
                  )
                ) {
                  run("merge-apply");
                }
              }}
              disabled={running}
              className={BUTTON_DANGER_SOLID}
            >
              Apply merge…
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
