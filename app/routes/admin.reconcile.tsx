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

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const status = await getReconcileJobStatus();
  // Only ship the (potentially large) proposal list once a dry run has
  // completed — not on every running-state poll.
  const proposals =
    status?.status === "completed" && status.mode === "reconcile"
      ? await getStoredProposals()
      : null;
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

function kindBadge(kind: string) {
  return (
    <span className="badge badge-ghost badge-sm whitespace-nowrap">{kind}</span>
  );
}

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

  const changedCount = proposals?.filter((p) => p.changed).length ?? 0;
  const hasApplyable = changedCount > 0;

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-2">Train Line Reconciliation</h2>
      <p className="text-base-content/60 mb-6 max-w-3xl">
        A <strong>Dry run</strong> classifies each <code>train_line</code> row
        (rail / subway / tram / monorail / shinkansen / bus), matches railway
        lines to the bundled canonical dataset, and stores the proposed changes
        for review — it writes nothing. Review the table, then{" "}
        <strong>Apply</strong> writes exactly those proposals (no second LLM
        call, so what you see is what you get). Each dry run makes one LLM call
        per line, so it can take a few minutes.
      </p>

      {actionData && (
        <div
          className={`p-4 mb-4 rounded-lg ${
            actionData.success
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {actionData.message}
        </div>
      )}

      {/* Status */}
      {status && status.status !== "idle" && (
        <div className="mb-8 bg-base-100 p-6 rounded-lg shadow">
          <div className="flex justify-between mb-1">
            <span className="font-medium">
              Status:{" "}
              <span
                className={`font-bold ${
                  status.status === "running"
                    ? "text-blue-600"
                    : status.status === "completed"
                      ? "text-green-600"
                      : status.status === "failed"
                        ? "text-red-600"
                        : ""
                }`}
              >
                {status.status.toUpperCase()}
              </span>{" "}
              <span className="text-base-content/50">({status.mode})</span>
            </span>
            {status.total > 0 && <span>{pct}%</span>}
          </div>

          {status.total > 0 && (
            <div className="w-full bg-base-300 rounded-full h-2.5 mb-3">
              <div
                className={`h-2.5 rounded-full ${
                  status.status === "failed" ? "bg-red-600" : "bg-blue-600"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          <p className="text-sm">
            <span className="font-medium">Message:</span> {status.message}
          </p>
          <p className="text-sm">
            <span className="font-medium">Progress:</span> {status.processed} /{" "}
            {status.total}
          </p>
          {status.error && (
            <p className="text-sm text-red-600">
              <span className="font-medium">Error:</span> {status.error}
            </p>
          )}

          {/* Summary */}
          {isReconcileSummary(status.summary) && (
            <div className="mt-4 text-sm grid grid-cols-1 md:grid-cols-2 gap-2">
              <p>
                <span className="font-medium">Canonical matches:</span>{" "}
                {status.summary.matched} / {status.summary.total}
              </p>
              <p>
                <span className="font-medium">Rows that would change:</span>{" "}
                {status.summary.changed}
              </p>
              <p>
                <span className="font-medium">Bus names to clear:</span>{" "}
                {status.summary.busCleared}
              </p>
              <p className="md:col-span-2">
                <span className="font-medium">By kind:</span>{" "}
                {Object.entries(status.summary.countsByKind)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}
              </p>
            </div>
          )}
          {isApplySummary(status.summary) && (
            <div className="mt-4 text-sm grid grid-cols-1 md:grid-cols-3 gap-2">
              <p>
                <span className="font-medium">Applied:</span>{" "}
                {status.summary.applied}
              </p>
              <p>
                <span className="font-medium">Bus names cleared:</span>{" "}
                {status.summary.busCleared}
              </p>
              <p>
                <span className="font-medium">Skipped:</span>{" "}
                {status.summary.skipped}
              </p>
            </div>
          )}
          {isMergeSummary(status.summary) && (
            <div className="mt-4 text-sm">
              <p>
                <span className="font-medium">Duplicate groups:</span>{" "}
                {status.summary.groups} —{" "}
                <span className="font-medium">rows to delete:</span>{" "}
                {status.summary.rowsDeleted}
              </p>
              {status.summary.plan.length > 0 && (
                <pre className="mt-2 max-h-64 overflow-auto bg-base-200 p-3 rounded text-xs whitespace-pre-wrap">
                  {status.summary.plan.join("\n")}
                </pre>
              )}
            </div>
          )}

          {status.status !== "running" && (
            <button
              type="button"
              onClick={reset}
              className="mt-4 px-4 py-2 bg-gray-600 text-white font-medium rounded-md hover:bg-gray-700"
            >
              Clear status
            </button>
          )}
        </div>
      )}

      {/* Proposal preview + apply (after a completed dry run) */}
      {proposals && proposals.length > 0 && (
        <div className="mb-8 bg-base-100 p-6 rounded-lg shadow">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold">
              Preview — {changedCount} of {proposals.length} rows would change
            </h3>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    `Apply ${changedCount} previewed change(s) to the train_line table? This writes exactly what is shown below.`
                  )
                ) {
                  run("apply-stored");
                }
              }}
              disabled={running || !hasApplyable}
              className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:bg-gray-400"
            >
              Apply these {changedCount} results
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-base-200 text-left">
                  <th className="py-2 px-3">Line (raw)</th>
                  <th className="py-2 px-3">Region</th>
                  <th className="py-2 px-3">Kind</th>
                  <th className="py-2 px-3">Canonical match</th>
                  <th className="py-2 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-300">
                {[...proposals]
                  .sort(
                    (a, b) => Number(b.changed) - Number(a.changed) || a.id - b.id
                  )
                  .map((p: LineProposal) => (
                    <tr
                      key={p.id}
                      className={p.changed ? "bg-yellow-50" : "opacity-60"}
                    >
                      <td className="py-1 px-3 whitespace-nowrap">{p.name}</td>
                      <td className="py-1 px-3">{p.region ?? "-"}</td>
                      <td className="py-1 px-3">
                        {p.oldKind === p.newKind ? (
                          kindBadge(p.newKind)
                        ) : (
                          <span className="flex items-center gap-1">
                            {kindBadge(p.oldKind)}
                            <span className="text-base-content/50">→</span>
                            {kindBadge(p.newKind)}
                          </span>
                        )}
                      </td>
                      <td className="py-1 px-3">
                        {p.newCanonicalName ?? (
                          <span className="text-base-content/40">—</span>
                        )}
                      </td>
                      <td className="py-1 px-3 text-base-content/70">
                        {p.clearBusName ? "clear stale name" : ""}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-base-100 p-6 rounded-lg shadow space-y-6">
        <div>
          <label
            htmlFor="limit"
            className="block text-sm font-medium text-base-content/70 mb-1"
          >
            Limit (optional — reconcile only the first N rows, for a quick test)
          </label>
          <input
            id="limit"
            type="number"
            min="1"
            placeholder="all rows"
            disabled={running}
            className="w-40 p-2 border border-base-300 rounded-md"
          />
        </div>

        <div>
          <h3 className="font-semibold mb-2">Reconcile</h3>
          <p className="text-sm text-base-content/60 mb-2">
            Run a dry run to preview, then apply from the preview table above.
          </p>
          <button
            type="button"
            onClick={() => run("reconcile")}
            disabled={running}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            Dry run
          </button>
        </div>

        <div>
          <h3 className="font-semibold mb-2">
            Merge duplicates{" "}
            <span className="text-base-content/50 font-normal text-sm">
              (run reconcile + apply first so canonical ids are populated)
            </span>
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run("merge")}
              disabled={running}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400"
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
              className="px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 disabled:bg-gray-400"
            >
              Apply merge (destructive)
            </button>
          </div>
        </div>

        {running && (
          <p className="text-sm text-blue-600">
            A job is running — buttons are disabled until it finishes.
          </p>
        )}
      </div>
    </div>
  );
}
