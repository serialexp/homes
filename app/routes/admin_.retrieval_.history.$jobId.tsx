import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { getRetrievalJobWithSections } from "../services/retrievalJobService.server.js";
import { requireAdminAuth } from "../utils/auth.server.js";
import { AdminShell, BUTTON_SECONDARY, PageHeader, PANEL, StatusPill } from "../components/AdminUi.js";

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

const HEAD_CELL = "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-base-content/70";

export default function RetrievalJobSectionsPage() {
  const { job } = useLoaderData<typeof loader>();

  return (
    <AdminShell>
      <PageHeader
        title={`Retrieval job #${job.id}`}
        description={
          <span className="flex flex-col gap-2">
            <span className="flex flex-wrap items-center gap-2.5 text-base-content/80">
              <StatusPill status={job.status} />
              <span>
                Started {new Date(job.startTime).toLocaleString()} · {formatDuration(job.startTime, job.endTime)}
              </span>
            </span>
            {job.errorMessage && (
              <span className="rounded-field bg-error/10 px-3 py-2 text-sm font-medium text-error">{job.errorMessage}</span>
            )}
          </span>
        }
        actions={
          <Link to="/admin/retrieval/history" className={BUTTON_SECONDARY}>
            Back to history
          </Link>
        }
      />

      {job.sections.length === 0 ? (
        <p className={`${PANEL} m-0 p-6 text-base-content/70`}>
          No section records for this job. Jobs run before section recording was added have none.
        </p>
      ) : (
        <section aria-label="Sections" className={`${PANEL} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-sm">
              <thead className="bg-base-200/60">
                <tr className="text-left">
                  <th scope="col" className={HEAD_CELL}>Section</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Items found</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Scraped pages</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Computed pages</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Pages used</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Pages fetched</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>Items processed</th>
                  <th scope="col" className={`${HEAD_CELL} text-right`}>New / updated</th>
                  <th scope="col" className={HEAD_CELL}>Stop reason</th>
                  <th scope="col" className={HEAD_CELL}>Duration</th>
                  <th scope="col" className={HEAD_CELL}>Error</th>
                </tr>
              </thead>
              <tbody>
                {job.sections.map((section) => (
                  <tr key={section.id} className="border-t border-base-300/60 hover:bg-base-200/50">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] font-medium">{section.sectionKey}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.calcTotalItems.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.scrapedPages}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.computedPages}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.totalPages}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.pagesFetched}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.itemsProcessed.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{section.newItems} / {section.updatedItems}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{stopReasonLabel[section.stopReason] ?? section.stopReason}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-base-content/70">{formatDuration(section.startedAt, section.finishedAt)}</td>
                    <td className="px-4 py-2.5 text-error">{section.errorMessage ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AdminShell>
  );
}
