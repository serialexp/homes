import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  getReconcileJobStatus,
  resetReconcileJobStatus,
  startReconcileJob,
  type ReconcileJobStatus,
  type ReconcileMode,
  type ReconcileSummary,
  type MergeSummary,
} from "../services/reconcileLinesService.server.js";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const status = await getReconcileJobStatus();
  return json({ status });
}

const VALID_MODES: ReconcileMode[] = [
  "reconcile",
  "reconcile-apply",
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
function isMergeSummary(s: ReconcileJobStatus["summary"]): s is MergeSummary {
  return !!s && s.phase === "merge";
}

export default function ReconcilePage() {
  const { status } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const [current, setCurrent] = useState<ReconcileJobStatus | null>(status);
  const [limit, setLimit] = useState("");

  const running = current?.status === "running";

  // Poll while a job is running.
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/admin/reconcile/status", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        setCurrent(data.status);
      } catch (error) {
        console.error("Error fetching reconcile status:", error);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [running]);

  const run = (mode: ReconcileMode) => {
    const fd = new FormData();
    fd.append("_action", mode);
    if (limit.trim()) fd.append("limit", limit.trim());
    submit(fd, { method: "post" });
  };
  const reset = () => {
    const fd = new FormData();
    fd.append("_action", "reset");
    submit(fd, { method: "post" });
  };

  const pct =
    current && current.total > 0
      ? Math.round((current.processed / current.total) * 100)
      : 0;

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-2">Train Line Reconciliation</h2>
      <p className="text-base-content/60 mb-6 max-w-3xl">
        Classify each <code>train_line</code> row (rail / subway / tram /
        monorail / shinkansen / bus) and match railway lines to a canonical line
        from the bundled dataset. Dry-runs write nothing. Applying also clears
        stale hallucinated romaji on bus rows so the original Japanese label
        shows. Each run makes one LLM call per line, so it can take a few
        minutes.
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
      {current && current.status !== "idle" && (
        <div className="mb-8 bg-base-100 p-6 rounded-lg shadow">
          <div className="flex justify-between mb-1">
            <span className="font-medium">
              Status:{" "}
              <span
                className={`font-bold ${
                  current.status === "running"
                    ? "text-blue-600"
                    : current.status === "completed"
                      ? "text-green-600"
                      : current.status === "failed"
                        ? "text-red-600"
                        : ""
                }`}
              >
                {current.status.toUpperCase()}
              </span>{" "}
              <span className="text-base-content/50">({current.mode})</span>
            </span>
            {current.total > 0 && <span>{pct}%</span>}
          </div>

          {current.total > 0 && (
            <div className="w-full bg-base-300 rounded-full h-2.5 mb-3">
              <div
                className={`h-2.5 rounded-full ${
                  current.status === "failed" ? "bg-red-600" : "bg-blue-600"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          <p className="text-sm">
            <span className="font-medium">Message:</span> {current.message}
          </p>
          <p className="text-sm">
            <span className="font-medium">Progress:</span> {current.processed} /{" "}
            {current.total}
          </p>
          {current.error && (
            <p className="text-sm text-red-600">
              <span className="font-medium">Error:</span> {current.error}
            </p>
          )}

          {/* Summary */}
          {isReconcileSummary(current.summary) && (
            <div className="mt-4 text-sm grid grid-cols-1 md:grid-cols-2 gap-2">
              <p>
                <span className="font-medium">Canonical matches:</span>{" "}
                {current.summary.matched} / {current.summary.total}
              </p>
              <p>
                <span className="font-medium">Rows changed:</span>{" "}
                {current.summary.changed}
              </p>
              <p>
                <span className="font-medium">Bus names cleared:</span>{" "}
                {current.summary.busCleared}
              </p>
              <p className="md:col-span-2">
                <span className="font-medium">By kind:</span>{" "}
                {Object.entries(current.summary.countsByKind)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}
              </p>
            </div>
          )}
          {isMergeSummary(current.summary) && (
            <div className="mt-4 text-sm">
              <p>
                <span className="font-medium">Duplicate groups:</span>{" "}
                {current.summary.groups} —{" "}
                <span className="font-medium">rows to delete:</span>{" "}
                {current.summary.rowsDeleted}
              </p>
              {current.summary.plan.length > 0 && (
                <pre className="mt-2 max-h-64 overflow-auto bg-base-200 p-3 rounded text-xs whitespace-pre-wrap">
                  {current.summary.plan.join("\n")}
                </pre>
              )}
            </div>
          )}

          {current.status !== "running" && (
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
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="all rows"
            disabled={running}
            className="w-40 p-2 border border-base-300 rounded-md"
          />
        </div>

        <div>
          <h3 className="font-semibold mb-2">Reconcile</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run("reconcile")}
              disabled={running}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            >
              Dry run
            </button>
            <button
              type="button"
              onClick={() => run("reconcile-apply")}
              disabled={running}
              className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:bg-gray-400"
            >
              Apply
            </button>
          </div>
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
