import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from '../utils/db.server.js';

export async function loader({ params }: LoaderFunctionArgs) {
  const unitId = parseInt(params.id || "0");
  
  if (!unitId) {
    throw new Response("Rental Unit ID is required", { status: 400 });
  }
  
  // Get rental unit with building and price history
  const rentalUnit = await prisma.rentalUnit.findUnique({
    where: { id: unitId },
    include: {
      building: true,
      rentalPriceHistory: {
        orderBy: { recorded_at: "desc" }
      }
    }
  });
  
  if (!rentalUnit) {
    throw new Response("Rental Unit not found", { status: 404 });
  }

  return json({ rentalUnit });
}

export default function RentalUnitDetails() {
  const { rentalUnit } = useLoaderData<typeof loader>();
  
  // Parse stations JSON
  const stations = JSON.parse(rentalUnit.building.stations || '[]');
  
  // Parse image URLs if they exist
  const imageUrls = rentalUnit.image_urls ? rentalUnit.image_urls.split(',') : [];

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Rental Unit Details</h1>
        <Link 
          to={`/admin/rentals/building/${rentalUnit.building_id}`} 
          className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
        >
          Back to Building
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Unit Details */}
        <div className="md:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Unit Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-lg font-medium mb-2">Basic Details</h3>
                <div className="space-y-2">
                  <p><span className="font-medium">Layout:</span> {rentalUnit.layout}</p>
                  <p><span className="font-medium">Floor:</span> {rentalUnit.floor}</p>
                  <p><span className="font-medium">Size:</span> {rentalUnit.size_text || `${rentalUnit.size} m²`}</p>
                  <p><span className="font-medium">Rent:</span> {rentalUnit.rent_text || `¥${rentalUnit.rent.toLocaleString()}`}</p>
                  <p><span className="font-medium">Management Fee:</span> {rentalUnit.management_fee_text || `¥${rentalUnit.management_fee.toLocaleString()}`}</p>
                  <p><span className="font-medium">Deposit:</span> {rentalUnit.deposit}</p>
                  <p><span className="font-medium">Gratuity:</span> {rentalUnit.gratuity}</p>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">Building Information</h3>
                <div className="space-y-2">
                  <p><span className="font-medium">Building:</span> {rentalUnit.building.title || rentalUnit.building.address}</p>
                  <p><span className="font-medium">Type:</span> {rentalUnit.building.building_type}</p>
                  <p><span className="font-medium">Age:</span> {rentalUnit.building.age}</p>
                  <p><span className="font-medium">Address:</span> {rentalUnit.building.address}</p>
                </div>
                
                <h3 className="text-lg font-medium mt-4 mb-2">Stations</h3>
                {stations.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1">
                    {stations.map((station: any, index: number) => (
                      <li key={index}>
                        {station.line} - {station.station} ({station.walking_minutes} min walk)
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">No station information available</p>
                )}
              </div>
            </div>
            
            {/* Tags */}
            {rentalUnit.tags && (
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {rentalUnit.tags.split(',').map((tag, index) => (
                    <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* External Link */}
            <div className="mt-6">
              <a 
                href={rentalUnit.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 inline-block"
              >
                View on SUUMO
              </a>
            </div>
          </div>
          
          {/* Price History */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Price History</h2>
            
            {rentalUnit.rentalPriceHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead>
                    <tr className="bg-gray-100 text-gray-600 uppercase text-sm leading-normal">
                      <th className="py-3 px-6 text-left">Date</th>
                      <th className="py-3 px-6 text-right">Rent</th>
                      <th className="py-3 px-6 text-right">Management Fee</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 text-sm">
                    {rentalUnit.rentalPriceHistory.map((history: any) => (
                      <tr key={history.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-3 px-6 text-left">{new Date(history.recorded_at).toLocaleDateString()}</td>
                        <td className="py-3 px-6 text-right">{history.rent_text || `¥${history.rent.toLocaleString()}`}</td>
                        <td className="py-3 px-6 text-right">{history.management_fee_text || `¥${history.management_fee.toLocaleString()}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No price history available</p>
            )}
          </div>
        </div>
        
        {/* Images */}
        <div className="md:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Images</h2>
            
            <div className="space-y-4">
              {rentalUnit.thumbnail_url && (
                <div>
                  <img 
                    src={rentalUnit.thumbnail_url} 
                    alt="Thumbnail" 
                    className="w-full h-auto rounded"
                  />
                </div>
              )}
              
              {imageUrls.length > 0 ? (
                imageUrls.map((url, index) => (
                  <div key={index}>
                    <img 
                      src={url.trim()} 
                      alt={`Image ${index + 1}`} 
                      className="w-full h-auto rounded"
                    />
                  </div>
                ))
              ) : (
                !rentalUnit.thumbnail_url && (
                  <p className="text-gray-500">No images available</p>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 