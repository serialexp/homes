import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import prisma from "../utils/db.server.js";
import { Pagination } from "../components/Pagination.js";
import { PANEL, PageHeader } from "../components/AdminUi.js";

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
    <>
      <PageHeader
        title="XPath debug"
        description="Cached Suumo pages, newest first. Open one to test XPath queries and parsers against its HTML."
      />

      <section aria-label="Cached pages" className={`${PANEL} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm tabular-nums">
            <thead className="bg-base-200/60 text-left text-xs font-semibold uppercase tracking-[0.05em] text-base-content/70">
              <tr>
                <th scope="col" className="px-4 py-3">ID</th>
                <th scope="col" className="px-4 py-3">URL</th>
                <th scope="col" className="px-4 py-3">Kind</th>
                <th scope="col" className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.id} className="border-t border-base-300/60 align-middle hover:bg-base-200/50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] font-medium">#{page.id}</td>
                  <td className="max-w-[420px] px-4 py-3">
                    {/* External Suumo URL: a plain anchor, not a router Link. */}
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={page.url}
                      className="block truncate font-mono text-[13px] text-primary hover:underline"
                    >
                      {page.url}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-md bg-base-200 px-2 py-0.5 text-xs font-semibold text-base-content/80">{page.kind}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      to={`/admin/xpath-debug/${page.id}`}
                      className="inline-flex min-h-11 items-center px-2 font-semibold text-primary no-underline hover:underline"
                    >
                      Debug
                    </Link>
                  </td>
                </tr>
              ))}

              {pages.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-base-content/70">
                    No cached pages found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="border-t border-base-300 px-4 py-3">
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              summary={`Page ${pagination.currentPage} of ${pagination.totalPages}`}
              pageHref={(p) => `?page=${p}`}
            />
          </div>
        )}
      </section>
    </>
  );
}
