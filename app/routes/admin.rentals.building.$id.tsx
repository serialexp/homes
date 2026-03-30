import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from '../utils/db.server.js';
import type { Building, RentalUnit } from "@prisma/client";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const buildingId = parseInt(params.id || "0");
  
  if (!buildingId) {
    throw new Response("Building ID is required", { status: 400 });
  }
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 10;
  const skip = (page - 1) * limit;

  // Get building details
  const building = await prisma.building.findUnique({
    where: { id: buildingId }
  });
  
  if (!building) {
    throw new Response("Building not found", { status: 404 });
  }
  
  // Get rental units for this building
  const rentalUnits = await prisma.rentalUnit.findMany({
    where: { building_id: buildingId },
    skip,
    take: limit,
    orderBy: { last_updated: "desc" }
  });
  
  const totalUnits = await prisma.rentalUnit.count({
    where: { building_id: buildingId }
  });
  
  const totalPages = Math.ceil(totalUnits / limit);

  return json({
    building,
    rentalUnits,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: totalUnits
    }
  });
}

export default function BuildingDetails() {
  const { building, rentalUnits, pagination } = useLoaderData<typeof loader>();

  // Parse stations JSON
  const stations = JSON.parse(building.stations || '[]');

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Building Details</h1>
        <Link 
          to="/admin/rentals" 
          className="px-3 py-1 bg-base-300 text-base-content rounded hover:bg-base-200"
        >
          Back to Buildings
        </Link>
      </div>

      {/* Building Details */}
      <div className="bg-base-100 rounded-lg shadow-md p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">{building.title || building.address}</h2>
            
            <div className="space-y-2">
              <p><span className="font-medium">Address:</span> {building.address}</p>
              <p><span className="font-medium">Type:</span> {building.building_type}</p>
              <p><span className="font-medium">Age:</span> {building.age}</p>
              <p><span className="font-medium">Floors:</span> {building.floors}</p>
              <p><span className="font-medium">Location:</span> {building.state}, {building.city}{building.district ? `, ${building.district}` : ''}</p>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Stations</h3>
            {stations.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {stations.map((station: any, index: number) => (
                  <li key={index}>
                    {station.line} - {station.station} ({station.walking_minutes} min walk)
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base-content/60">No station information available</p>
            )}
            
            {building.main_image_url && (
              <div className="mt-4">
                <img 
                  src={building.main_image_url} 
                  alt={building.title || building.address} 
                  className="max-w-full h-auto rounded"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rental Units */}
      <div className="bg-base-100 rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Rental Units ({pagination.totalItems})</h2>
        
        <div className="overflow-x-auto">
          <table className="min-w-full bg-base-100">
            <thead>
              <tr className="bg-base-200 text-base-content/70 uppercase text-sm leading-normal">
                <th className="py-3 px-6 text-left">ID</th>
                <th className="py-3 px-6 text-left">Floor</th>
                <th className="py-3 px-6 text-left">Layout</th>
                <th className="py-3 px-6 text-left">Size</th>
                <th className="py-3 px-6 text-right">Rent</th>
                <th className="py-3 px-6 text-right">Management Fee</th>
                <th className="py-3 px-6 text-center">Last Updated</th>
                <th className="py-3 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-base-content/70 text-sm">
              {rentalUnits.map((unit: any) => (
                <tr key={unit.id} className="border-b border-base-300 hover:bg-base-200">
                  <td className="py-3 px-6 text-left">{unit.id}</td>
                  <td className="py-3 px-6 text-left">{unit.floor}</td>
                  <td className="py-3 px-6 text-left">{unit.layout}</td>
                  <td className="py-3 px-6 text-left">{unit.size_text || `${unit.size} m²`}</td>
                  <td className="py-3 px-6 text-right">{unit.rent_text || `¥${unit.rent.toLocaleString()}`}</td>
                  <td className="py-3 px-6 text-right">{unit.management_fee_text || `¥${unit.management_fee.toLocaleString()}`}</td>
                  <td className="py-3 px-6 text-center">{new Date(unit.last_updated).toLocaleDateString()}</td>
                  <td className="py-3 px-6 text-center">
                    <Link 
                      to={`/admin/rentals/unit/${unit.id}`}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2"
                    >
                      Details
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
                  to={`/admin/rentals/building/${building.id}?page=${pagination.currentPage - 1}`}
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
                  to={`/admin/rentals/building/${building.id}?page=${pagination.currentPage + 1}`}
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