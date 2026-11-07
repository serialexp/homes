import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { getRetrievalJobs, getRetrievalJobStats, completeRetrievalJob } from "../services/retrievalJobService.server.js";
import { storeRetrievalStatus, getRetrievalStatus } from "../services/redis.server.js";
import { requireAdminAuth } from "../utils/auth.server.js";
import prisma from "../utils/db.server.js";
import { areas, propertyTypes } from "../data/propertyData.js";
import { Pagination } from "../components/Pagination.js";
import {
  AdminShell,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  PageHeader,
  PANEL,
  StatusPill,
} from "../components/AdminUi.js";

/** Jobs per page: the default, and the ceiling a query string may not exceed. */
const DEFAULT_JOBS_PER_PAGE = 10;
const MAX_JOBS_PER_PAGE = 100;
/** Highest page a query string may ask for. Keeps the row offset well inside Prisma's 32-bit skip. */
const MAX_JOBS_PAGE = 100_000;

/** A whole number from a query parameter, clamped to [min, max]. Missing or non-numeric input gives the fallback. */
function boundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

// Define a type for the serialized job data
type SerializedRetrievalJob = {
  id: number;
  processId: string;
  status: string;
  startTime: string;
  endTime: string | null;
  region: string | null;
  province: string | null;
  type: string | null;
  totalItems: number;
  processedItems: number;
  totalPages: number;
  downloadedPages: number;
  errorMessage: string | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminAuth(request);
  const url = new URL(request.url);
  const page = boundedInt(url.searchParams.get("page"), 1, 1, MAX_JOBS_PAGE);
  const limit = boundedInt(url.searchParams.get("limit"), DEFAULT_JOBS_PER_PAGE, 1, MAX_JOBS_PER_PAGE);

  const [jobsData, stats] = await Promise.all([
    getRetrievalJobs(page, limit),
    getRetrievalJobStats()
  ]);

  return json({ jobsData, stats });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdminAuth(request);
  const formData = await request.formData();
  const actionType = formData.get("_action") as string;
  const processId = formData.get("processId") as string;

  if (actionType === "mark_failed" && processId) {
    await completeRetrievalJob(processId, {
      status: 'failed',
      errorMessage: 'Manually marked as failed by admin',
    });

    // Also reset Redis if this job is the current one
    const redisStatus = await getRetrievalStatus();
    if (redisStatus && redisStatus.processId === processId) {
      await storeRetrievalStatus({
        status: 'idle',
        message: 'No retrieval process running',
        progress: 0,
        total: 0,
        startTime: new Date(),
        sectionsToFetch: 0,
        sectionsProcessed: 0,
      });
    }

    return json({ success: true });
  }

  if (actionType === "reset_all_stuck") {
    await prisma.retrievalJob.updateMany({
      where: { status: 'running' },
      data: {
        status: 'failed',
        endTime: new Date(),
        errorMessage: 'Manually marked as failed by admin',
      },
    });

    // Also reset Redis
    await storeRetrievalStatus({
      status: 'idle',
      message: 'No retrieval process running',
      progress: 0,
      total: 0,
      startTime: new Date(),
      sectionsToFetch: 0,
      sectionsProcessed: 0,
    });

    return json({ success: true });
  }

  return json({ success: false }, { status: 400 });
}

// Human-readable scope of a job, falling back to the stored ids when a name is unknown.
function scopeLabels(job: SerializedRetrievalJob): string[] {
  const labels: string[] = [];
  if (job.type) labels.push(propertyTypes[job.type] ?? job.type);
  if (job.region) labels.push(areas[job.region]?.name ?? job.region);
  if (job.region && job.province) labels.push(areas[job.region]?.provinces[job.province] ?? job.province);
  return labels;
}

export default function RetrievalHistoryPage() {
  const { jobsData, stats } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const currentPage = parseInt(searchParams.get("page") || "1", 10);
  
  // Format duration between start and end time
  const formatDuration = (startTime: string | Date, endTime?: string | Date | null) => {
    if (!endTime) return "In progress";
    
    const start = startTime instanceof Date ? startTime : new Date(startTime);
    const end = endTime instanceof Date ? endTime : new Date(endTime);
    const durationMs = end.getTime() - start.getTime();
    
    // Format as minutes and seconds
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    
    return `${minutes}m ${seconds}s`;
  };

  const { page, limit, total, totalPages } = jobsData.pagination;
  const firstShown = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastShown = Math.min(page * limit, total);
  
  const statTiles = [
    { label: "Total jobs", value: stats.total, dot: "bg-[#8A90A0]" },
    { label: "Completed", value: stats.completed, dot: "bg-[#1A5C3A]" },
    { label: "Failed", value: stats.failed, dot: "bg-[#B8301A]" },
    { label: "Cancelled", value: stats.cancelled, dot: "bg-[#B07A10]" },
    { label: "Success rate", value: `${stats.successRate}%`, dot: "bg-primary" },
  ];
  
  return (
    <AdminShell>
      <PageHeader
        title="Job history"
        description="Every retrieval run, scheduled or manual."
        actions={
          <>
            <Form method="post">
              <input type="hidden" name="_action" value="reset_all_stuck" />
              <button type="submit" className={BUTTON_SECONDARY}>
                Mark stuck jobs as failed
              </button>
            </Form>
            <Link to="/admin/retrieval" className={BUTTON_PRIMARY}>
              Retrieval
            </Link>
          </>
        }
      />
      
      {/* Stats */}
      <dl className={`m-0 grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] overflow-hidden ${PANEL}`}>
        {statTiles.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-0.5 border-b border-r border-base-300/60 px-5 py-4">
            <dt className="flex items-center gap-2 text-[13px] text-base-content/70">
              <span aria-hidden="true" className={`size-2 rounded-full ${tile.dot}`} />
              {tile.label}
            </dt>
            <dd className="m-0 font-display text-[26px] font-bold tracking-[-0.02em] tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>
      
      {/* Jobs Table */}
      <section aria-label="Jobs" className={`${PANEL} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm tabular-nums">
            <thead className="bg-base-200/60 text-left text-xs font-semibold uppercase tracking-[0.05em] text-base-content/70">
              <tr>
                <th scope="col" className="px-4 py-3">ID</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Started</th>
                <th scope="col" className="px-4 py-3">Duration</th>
                <th scope="col" className="px-4 py-3">Scope</th>
                <th scope="col" className="px-4 py-3 text-right">Items</th>
                <th scope="col" className="px-4 py-3 text-right">Pages</th>
                <th scope="col" className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobsData.jobs.map((job: SerializedRetrievalJob) => {
                const scope = scopeLabels(job);
                const isOpen = job.status === 'running' || job.status === 'queued';
                return (
                  <tr key={job.id} className="border-t border-base-300/60 align-middle hover:bg-base-200/50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] font-medium">#{job.id}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusPill status={job.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-base-content/70">
                      {new Date(job.startTime).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-base-content/80">
                      {formatDuration(job.startTime, job.endTime)}
                    </td>
                    <td className="px-4 py-3">
                      {scope.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {scope.map((label) => (
                            <span key={label} className="whitespace-nowrap rounded-md bg-base-200 px-2 py-0.5 text-xs font-medium text-base-content/80">
                              {label}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-base-content/70">All</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {job.processedItems} / {job.totalItems}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-base-content/80">
                      {job.downloadedPages} / {job.totalPages}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/admin/retrieval/history/${job.id}`}
                          className="inline-flex min-h-11 items-center px-2 font-semibold text-primary no-underline hover:underline"
                        >
                          Sections
                        </Link>
                        {isOpen && (
                          <Form method="post">
                            <input type="hidden" name="_action" value="mark_failed" />
                            <input type="hidden" name="processId" value={job.processId} />
                            <button
                              type="submit"
                              className="inline-flex min-h-11 items-center px-2 font-semibold text-error hover:underline"
                            >
                              Mark failed
                            </button>
                          </Form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              
              {jobsData.jobs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-base-content/70">
                    No retrieval jobs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="border-t border-base-300 px-4 py-3">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              summary={`Showing ${firstShown}–${lastShown} of ${total}`}
              pageHref={(p) => `?page=${p}`}
            />
          </div>
        )}
      </section>
    </AdminShell>
  );
}
