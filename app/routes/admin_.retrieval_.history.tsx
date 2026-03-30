import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { getRetrievalJobs, getRetrievalJobStats, completeRetrievalJob } from "../services/retrievalJobService.server.js";
import { storeRetrievalStatus, getRetrievalStatus } from "../services/redis.server.js";
import { requireAdminAuth } from "../utils/auth.server.js";
import prisma from "../utils/db.server.js";
import type { RetrievalJob } from "@prisma/client";

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
  refresh: boolean;
  totalItems: number;
  processedItems: number;
  totalPages: number;
  downloadedPages: number;
  errorMessage: string | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminAuth(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);

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
  
  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-yellow-100 text-yellow-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Retrieval Job History</h2>
        <div className="flex space-x-2">
          <Form method="post">
            <input type="hidden" name="_action" value="reset_all_stuck" />
            <button
              type="submit"
              className="px-4 py-2 bg-yellow-600 text-white font-medium rounded-md hover:bg-yellow-700"
            >
              Reset All Stuck Jobs
            </button>
          </Form>
          <Link
            to="/admin/retrieval"
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
          >
            Back to Retrieval
          </Link>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Jobs</h3>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Completed</h3>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Failed</h3>
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Cancelled</h3>
          <p className="text-2xl font-bold text-yellow-600">{stats.cancelled}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Success Rate</h3>
          <p className="text-2xl font-bold">{stats.successRate}%</p>
        </div>
      </div>
      
      {/* Jobs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Started</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Filters</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pages</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {jobsData.jobs.map((job: SerializedRetrievalJob) => (
              <tr key={job.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{job.id}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(job.status)}`}>
                    {job.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(job.startTime).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDuration(job.startTime, job.endTime)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {job.region ? `Region: ${job.region}` : ''}
                  {job.province ? `, Province: ${job.province}` : ''}
                  {job.type ? `, Type: ${job.type}` : ''}
                  {job.refresh ? ', Refresh: Yes' : ''}
                  {!job.region && !job.province && !job.type && !job.refresh ? 'None' : ''}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {job.processedItems} / {job.totalItems}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {job.downloadedPages} / {job.totalPages}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {job.status === 'running' && (
                    <Form method="post">
                      <input type="hidden" name="_action" value="mark_failed" />
                      <input type="hidden" name="processId" value={job.processId} />
                      <button
                        type="submit"
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Mark Failed
                      </button>
                    </Form>
                  )}
                </td>
              </tr>
            ))}
            
            {jobsData.jobs.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500">
                  No retrieval jobs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      
      {/* Pagination */}
      {jobsData.pagination.totalPages > 1 && (
        <div className="flex justify-center mt-6">
          <nav className="inline-flex rounded-md shadow">
            {Array.from({ length: jobsData.pagination.totalPages }, (_, i) => i + 1).map((page) => (
              <Link
                key={page}
                to={`?page=${page}`}
                className={`px-4 py-2 text-sm font-medium ${
                  page === currentPage
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                } ${
                  page === 1 ? 'rounded-l-md' : ''
                } ${
                  page === jobsData.pagination.totalPages ? 'rounded-r-md' : ''
                }`}
              >
                {page}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
} 