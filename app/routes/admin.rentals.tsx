import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from '../utils/db.server.js';
import type { Building } from "@prisma/client";

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

export default function AdminRentals() {
  const { buildings, pagination } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Buildings & Rental Units</h1>
        <Link 
          to="/admin" 
          className="px-3 py-1 bg-base-300 text-base-content rounded hover:bg-base-200"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="bg-base-100 rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Buildings ({pagination.totalItems})</h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full bg-base-100">
            <thead>
              <tr className="bg-base-200 text-base-content/70 uppercase text-sm leading-normal">
                <th className="py-3 px-6 text-left">ID</th>
                <th className="py-3 px-6 text-left">Title</th>
                <th className="py-3 px-6 text-left">Address</th>
                <th className="py-3 px-6 text-left">Type</th>
                <th className="py-3 px-6 text-center">Units</th>
                <th className="py-3 px-6 text-center">Last Updated</th>
                <th className="py-3 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-base-content/70 text-sm">
              {buildings.map((building: any) => (
                <tr key={building.id} className="border-b border-base-300 hover:bg-base-200">
                  <td className="py-3 px-6 text-left">{building.id}</td>
                  <td className="py-3 px-6 text-left">{building.title || building.address}</td>
                  <td className="py-3 px-6 text-left">{building.address}</td>
                  <td className="py-3 px-6 text-left">{building.building_type}</td>
                  <td className="py-3 px-6 text-center">{building._count.rentalUnits}</td>
                  <td className="py-3 px-6 text-center">{new Date(building.last_updated).toLocaleDateString()}</td>
                  <td className="py-3 px-6 text-center">
                    <Link 
                      to={`/admin/rentals/building/${building.id}`}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2"
                    >
                      View Units
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center mt-6">
            <nav className="flex items-center">
              {pagination.currentPage > 1 && (
                <Link
                  to={`/admin/rentals?page=${pagination.currentPage - 1}`}
                  className="px-3 py-1 bg-base-300 text-base-content rounded-l hover:bg-base-200"
                >
                  Previous
                </Link>
              )}
              
              <span className="px-4 py-1 bg-base-200">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              
              {pagination.currentPage < pagination.totalPages && (
                <Link
                  to={`/admin/rentals?page=${pagination.currentPage + 1}`}
                  className="px-3 py-1 bg-base-300 text-base-content rounded-r hover:bg-base-200"
                >
                  Next
                </Link>
              )}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
} 