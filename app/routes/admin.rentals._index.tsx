import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from '../utils/db.server.js';
import { Pagination } from "../components/Pagination.js";
import { BUTTON_SECONDARY, PageHeader, PANEL } from "../components/AdminUi.js";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 10;
  const skip = (page - 1) * limit;

  const buildings = await prisma.building.findMany({
    skip,
    take: limit,
    orderBy: { last_updated: "desc" },
    include: {
      _count: {
        select: { rentalUnits: true }
      }
    }
  });

  const totalBuildings = await prisma.building.count();
  const totalPages = Math.ceil(totalBuildings / limit);

  return json({
    buildings,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: totalBuildings
    }
  });
}

const HEAD_CELL = "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-base-content/70";

export default function AdminRentals() {
  const { buildings, pagination } = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader
        title="Buildings & Rental Units"
        description="Manage buildings and rental units in the database."
        actions={
          <Link to="/admin" className={BUTTON_SECONDARY}>
            Back to dashboard
          </Link>
        }
      />

      <section aria-labelledby="buildings-h" className={`${PANEL} overflow-hidden`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-base-300 px-5 py-4">
          <h2 id="buildings-h" className="m-0 text-lg font-semibold">
            Buildings <span className="font-medium tabular-nums text-base-content/60">({pagination.totalItems})</span>
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-base-200/60">
              <tr className="text-left">
                <th scope="col" className={HEAD_CELL}>ID</th>
                <th scope="col" className={HEAD_CELL}>Title</th>
                <th scope="col" className={HEAD_CELL}>Address</th>
                <th scope="col" className={HEAD_CELL}>Type</th>
                <th scope="col" className={`${HEAD_CELL} text-right`}>Units</th>
                <th scope="col" className={`${HEAD_CELL} text-right`}>Last updated</th>
                <th scope="col" className={HEAD_CELL}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {buildings.map((building) => (
                <tr key={building.id} className="border-t border-base-300/60 hover:bg-base-200/50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-base-content/70">{building.id}</td>
                  <td className="px-4 py-3 font-medium">{building.title || building.address}</td>
                  <td className="px-4 py-3 text-base-content/80">{building.address}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-base-content/80">{building.building_type}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{building._count.rentalUnits}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-base-content/70">{new Date(building.last_updated).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      to={`/admin/rentals/building/${building.id}`}
                      className="inline-flex min-h-11 items-center px-2 font-semibold text-primary no-underline hover:underline"
                    >
                      View units
                    </Link>
                  </td>
                </tr>
              ))}
              {buildings.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-base-content/70">No buildings found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-base-300 px-4 py-3">
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            summary={`Page ${pagination.currentPage} of ${pagination.totalPages}`}
            pageHref={(p) => `/admin/rentals?page=${p}`}
          />
        </div>
      </section>
    </>
  );
}
