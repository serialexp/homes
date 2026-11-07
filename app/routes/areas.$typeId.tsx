import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { propertyTypes, areas } from "../data/propertyData.js";
import prisma from "../utils/db.server.js";
import { AreaExplorer } from "../components/AreaExplorer.js";

export async function loader({ params }: LoaderFunctionArgs) {
  const typeId = params.typeId;

  if (!typeId || !propertyTypes[typeId as keyof typeof propertyTypes]) {
    throw new Response("Invalid property type", { status: 404 });
  }

  const provinceCounts = await prisma.property.groupBy({
    by: ['region', 'province'],
    where: { section_type: typeId },
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
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-4 pb-4 pt-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-base-content/60">
        <Link to="/" className="text-base-content/60 hover:text-base-content">Home</Link>
        <span aria-hidden="true">/</span>
        <span className="text-base-content">{selectedType.name}</span>
      </nav>

      <h1 className="m-0 font-display text-[clamp(30px,4vw,42px)] leading-[1.1] tracking-[-0.025em]">
        Select an area for {selectedType.name}
      </h1>

      <AreaExplorer
        areas={areas}
        countsByProvince={countsByProvince}
        hrefFor={(areaId, provinceId) => `/properties/${selectedType.id}/${areaId}/${provinceId}`}
        countNoun="listings"
      />
    </div>
  );
}
