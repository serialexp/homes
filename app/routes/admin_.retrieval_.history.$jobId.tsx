import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { getRetrievalJobWithSections } from "../services/retrievalJobService.server.js";
import { requireAdminAuth } from "../utils/auth.server.js";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdminAuth(request);
  const id = Number.parseInt(params.jobId ?? "", 10);
  if (!Number.isInteger(id)) {
    throw new Response("Invalid job id", { status: 400 });
  }

  const job = await getRetrievalJobWithSections(id);
  if (!job) {
    throw new Response("Retrieval job not found", { status: 404 });
  }

  // Dates are serialised by json(); the page formats them for display.
  return json({ job });
}

const formatDuration = (start: string, end: string | null) => {
  if (!end) return "In progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

const stopReasonLabel: Record<string, string> = {
  "completed": "All pages",
  "caught-up": "Caught up (known items)",
  "timed-out": "Timed out",
  "cancelled": "Cancelled",
  "no-items": "Page had no items",
  "failed": "Failed",
};

export default function RetrievalJobSectionsPage() {
  const { job } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Retrieval job #{job.id}</h1>
          <p className="text-sm text-base-content/60">
            {job.status.toUpperCase()} · started {new Date(job.startTime).toLocaleString()} · {formatDuration(job.startTime, job.endTime)}
          </p>
          {job.errorMessage && <p className="text-sm text-red-600 mt-1">{job.errorMessage}</p>}
        </div>
        <Link
          to="/admin/retrieval/history"
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
        >
          Back to History
        </Link>
      </div>

      {job.sections.length === 0 ? (
        <p className="text-base-content/60">
          No section records for this job. Jobs run before section recording was added have none.
        </p>
      ) : (
        <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
          <table className="min-w-full divide-y divide-base-300 text-sm">
            <thead className="bg-base-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Section</th>
                <th className="px-4 py-3 text-right font-medium">Items found</th>
                <th className="px-4 py-3 text-right font-medium">Scraped pages</th>
                <th className="px-4 py-3 text-right font-medium">Computed pages</th>
                <th className="px-4 py-3 text-right font-medium">Pages used</th>
                <th className="px-4 py-3 text-right font-medium">Pages fetched</th>
                <th className="px-4 py-3 text-right font-medium">Items processed</th>
                <th className="px-4 py-3 text-right font-medium">New / updated</th>
                <th className="px-4 py-3 text-left font-medium">Stop reason</th>
                <th className="px-4 py-3 text-left font-medium">Duration</th>
                <th className="px-4 py-3 text-left font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-300">
              {job.sections.map((section) => (
                <tr key={section.id} className="hover:bg-base-200">
                  <td className="px-4 py-2 whitespace-nowrap font-mono">{section.sectionKey}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{section.calcTotalItems.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{section.scrapedPages}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{section.computedPages}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{section.totalPages}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{section.pagesFetched}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{section.itemsProcessed.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{section.newItems} / {section.updatedItems}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{stopReasonLabel[section.stopReason] ?? section.stopReason}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-base-content/60">{formatDuration(section.startedAt, section.finishedAt)}</td>
                  <td className="px-4 py-2 text-red-600">{section.errorMessage ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
