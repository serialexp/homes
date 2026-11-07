import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { areas } from "../data/propertyData.js";
import prisma from "../utils/db.server.js";
import { AreaExplorer } from "../components/AreaExplorer.js";

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
    FROM rental_unit ru
    JOIN building b ON ru.building_id = b.id
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
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 pb-4 pt-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-base-content/60">
        <Link to="/" className="text-base-content/60 hover:text-base-content">Home</Link>
        <span aria-hidden="true">/</span>
        <span className="text-base-content">{selectedType.name}</span>
      </nav>

      <h1 className="m-0 font-display text-[clamp(30px,4vw,42px)] leading-[1.1] tracking-[-0.025em]">
        Select an area for rentals
      </h1>

      <AreaExplorer
        areas={areas}
        countsByProvince={countsByProvince}
        hrefFor={(areaId, provinceId) => `/rental/properties/${selectedType.id}/${areaId}/${provinceId}`}
        countNoun="units available"
      />
    </div>
  );
}
