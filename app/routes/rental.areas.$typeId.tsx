import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useParams } from "@remix-run/react";
import { areas } from "../data/propertyData.js";
import prisma from "../utils/db.server.js";

// For rentals, we only have one type (040)
const RENTAL_TYPE_ID = '040';
const RENTAL_TYPE_NAME = 'Rental';

export async function loader({ params }: LoaderFunctionArgs) {
  const typeId = params.typeId;

  if (typeId !== RENTAL_TYPE_ID) {
    throw new Response("Invalid property type", { status: 404 });
  }

  // Count rental units per building region/province
  const provinceCounts = await prisma.$queryRaw<Array<{ region: string; province: string; count: bigint }>>`
    SELECT b.region, b.province, COUNT(ru.id) as count
    FROM RentalUnit ru
    JOIN Building b ON ru.building_id = b.id
    GROUP BY b.region, b.province
  `;

  const countsByProvince: Record<string, Record<string, number>> = {};
  for (const row of provinceCounts) {
    if (!countsByProvince[row.region]) countsByProvince[row.region] = {};
    countsByProvince[row.region][row.province] = Number(row.count);
  }

  return json({
    areas,
    selectedType: {
      id: RENTAL_TYPE_ID,
      name: RENTAL_TYPE_NAME
    },
    countsByProvince,
  });
}

export default function RentalAreasPage() {
  const { areas, selectedType, countsByProvince } = useLoaderData<typeof loader>();
  
  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <Link to="/" className="text-blue-600 hover:underline">← Back to Property Types</Link>
        <h2 className="text-2xl font-bold mt-2">Select Area for {selectedType.name} Properties</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(areas).map(([areaId, area]) => (
          <div key={areaId} className="bg-white border border-gray-200 rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold mb-1">{area.name}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {Object.values(countsByProvince[areaId] || {}).reduce((a, b) => a + b, 0).toLocaleString()} units
            </p>
            <div className="space-y-2">
              {Object.entries(area.provinces).map(([provinceId, provinceName]) => {
                const count = countsByProvince[areaId]?.[provinceId] || 0;
                return (
                <Link
                  key={provinceId}
                  to={`/rental/properties/${selectedType.id}/${areaId}/${provinceId}`}
                  className="flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 rounded"
                >
                  <span>{String(provinceName)}</span>
                  <span className="text-sm text-gray-500">{count.toLocaleString()}</span>
                </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 