import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useParams } from "@remix-run/react";
import { propertyTypes, areas } from "../data/propertyData.js";
import prisma from "../utils/db.server.js";

export async function loader({ params }: LoaderFunctionArgs) {
  const typeId = params.typeId;

  if (!typeId || !propertyTypes[typeId as keyof typeof propertyTypes]) {
    throw new Response("Invalid property type", { status: 404 });
  }

  const provinceCounts = await prisma.property.groupBy({
    by: ['region', 'province'],
    where: { type: typeId },
    _count: true,
  });

  const countsByProvince: Record<string, Record<string, number>> = {};
  for (const row of provinceCounts) {
    if (!countsByProvince[row.region]) countsByProvince[row.region] = {};
    countsByProvince[row.region][row.province] = row._count;
  }

  return json({
    areas,
    selectedType: {
      id: typeId,
      name: propertyTypes[typeId as keyof typeof propertyTypes]
    },
    countsByProvince,
  });
}

export default function AreasPage() {
  const { areas, selectedType, countsByProvince } = useLoaderData<typeof loader>();
  
  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <Link to="/" className="text-blue-600 hover:underline">← Back to Property Types</Link>
        <h2 className="text-2xl font-bold mt-2">Select Area for {selectedType.name}</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Object.entries(areas).map(([areaId, area]) => (
          <div key={areaId} className="bg-white border border-gray-200 rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold mb-1">{area.name}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {Object.values(countsByProvince[areaId] || {}).reduce((a, b) => a + b, 0).toLocaleString()} properties
            </p>
            <div className="space-y-2">
              {Object.entries(area.provinces).map(([provinceId, provinceName]) => {
                const count = countsByProvince[areaId]?.[provinceId] || 0;
                return (
                <Link
                  key={provinceId}
                  to={`/properties/${selectedType.id}/${areaId}/${provinceId}`}
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