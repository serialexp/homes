import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import prisma from "../utils/db.server.js";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  const [pages, totalCount] = await Promise.all([
    prisma.page.findMany({
      select: {
        id: true,
        url: true,
        kind: true,
      },
      orderBy: {
        id: 'desc',
      },
      take: pageSize,
      skip,
    }),
    prisma.page.count(),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return json({
    pages,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
    },
  });
}

export default function XPathDebugPage() {
  const { pages, pagination } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-6">XPath Debugging</h2>
      
      <div className="bg-base-100 p-6 rounded-lg shadow mb-6">
        <h3 className="text-xl font-semibold mb-4">Recently Retrieved Pages</h3>
        
        <div className="overflow-x-auto">
          <table className="min-w-full bg-base-100">
            <thead>
              <tr className="bg-base-200 border-b">
                <th className="py-2 px-4 text-left">ID</th>
                <th className="py-2 px-4 text-left">URL</th>
                <th className="py-2 px-4 text-left">Kind</th>
                <th className="py-2 px-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.id} className="border-b hover:bg-base-200">
                  <td className="py-2 px-4">{page.id}</td>
                  <td className="py-2 px-4">
                    <Link to={page.url} title={page.url} target="_blank">
                      <div className="truncate max-w-md" title={page.url}>
                        {page.url}
                      </div>
                    </Link>
                  </td>
                  <td className="py-2 px-4">{page.kind}</td>
                  <td className="py-2 px-4">
                    <Link 
                      to={`/admin/xpath-debug/${page.id}`}
                      
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      Debug
                    </Link>
                  </td>
                </tr>
              ))}
              
              {pages.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 px-4 text-center text-base-content/60">
                    No pages found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-between items-center mt-4">
            <div>
              Showing page {pagination.currentPage} of {pagination.totalPages}
            </div>
            <div className="flex space-x-2">
              {pagination.currentPage > 1 && (
                <Link
                  to={`/admin/xpath-debug?page=${pagination.currentPage - 1}`}
                  className="px-3 py-1 bg-base-300 rounded hover:bg-base-200"
                >
                  Previous
                </Link>
              )}
              
              {pagination.currentPage < pagination.totalPages && (
                <Link
                  to={`/admin/xpath-debug?page=${pagination.currentPage + 1}`}
                  className="px-3 py-1 bg-base-300 rounded hover:bg-base-200"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 