import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { propertyTypes } from "../data/propertyData.js";
import prisma from "../utils/db.server.js";

// For rentals, we only have one type (040)
const RENTAL_TYPE_ID = '040';

export async function loader({ request }: LoaderFunctionArgs) {
  // Filter out rental type from property types for purchase section
  const purchaseTypes = Object.entries(propertyTypes).reduce((acc, [id, name]) => {
    if (id !== RENTAL_TYPE_ID) {
      acc[id] = name;
    }
    return acc;
  }, {} as Record<string, string>);

  // Get counts per property type and total rental units
  const [propertyCounts, rentalCount] = await Promise.all([
    prisma.property.groupBy({
      by: ['type'],
      _count: true,
    }),
    prisma.rentalUnit.count(),
  ]);

  const countsByType: Record<string, number> = {};
  for (const row of propertyCounts) {
    if (row.type) countsByType[row.type] = row._count;
  }

  return json({
    purchaseTypes,
    rentalType: {
      id: RENTAL_TYPE_ID,
      name: propertyTypes[RENTAL_TYPE_ID as keyof typeof propertyTypes]
    },
    countsByType,
    rentalCount,
  });
}

export default function Index() {
  const { purchaseTypes, rentalType, countsByType, rentalCount } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto p-4">
      {/* Rental Properties Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Rental Properties</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to={`/rental/areas/${rentalType.id}`}
            className="block p-6 bg-base-100 border border-base-300 rounded-lg shadow hover:bg-base-200"
          >
            <h3 className="text-xl font-semibold">{rentalType.name}</h3>
            <p className="mt-1 text-2xl font-bold text-blue-600">{rentalCount.toLocaleString()}</p>
            <p className="mt-1 text-base-content/70">Browse rental properties across Japan</p>
          </Link>
        </div>
      </div>

      {/* Purchase Properties Section */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Properties for Purchase</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(purchaseTypes).map(([typeId, typeName]) => (
            <Link
              key={typeId}
              to={`/areas/${typeId}`}
              className="block p-6 bg-base-100 border border-base-300 rounded-lg shadow hover:bg-base-200"
            >
              <h3 className="text-xl font-semibold">{String(typeName)}</h3>
              <p className="mt-1 text-2xl font-bold text-blue-600">{(countsByType[typeId] || 0).toLocaleString()}</p>
              <p className="mt-1 text-base-content/70">Browse {String(typeName).toLowerCase()} properties</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
} 