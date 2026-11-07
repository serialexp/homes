import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from '../utils/db.server.js';
import { Pagination } from "../components/Pagination.js";
import { BUTTON_SECONDARY, LABEL, PageHeader, PANEL } from "../components/AdminUi.js";
import { parseStations } from "../utils/stations.js";

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

const HEAD_CELL = "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-base-content/70";

export default function BuildingDetails() {
  const { building, rentalUnits, pagination } = useLoaderData<typeof loader>();

  // Parse stations JSON
  const stations = parseStations(building.stations);

  return (
    <>
      <PageHeader
        title={building.title || building.address}
        description={`Building #${building.id}`}
        actions={
          <Link to="/admin/rentals" className={BUTTON_SECONDARY}>
            Back to buildings
          </Link>
        }
      />

      {/* Building Details */}
      <section aria-labelledby="building-h" className={`${PANEL} grid gap-6 p-6 md:grid-cols-2`}>
        <div className="flex min-w-0 flex-col gap-4">
          <h2 id="building-h" className="sr-only">Building details</h2>
          <dl className="m-0 grid grid-cols-2 gap-x-5 gap-y-3.5 text-sm">
            <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Address</dt><dd className="m-0 font-medium">{building.address}</dd></div>
            <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Type</dt><dd className="m-0 font-medium">{building.building_type}</dd></div>
            <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Age</dt><dd className="m-0 font-medium">{building.age ?? "—"}</dd></div>
            <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Floors</dt><dd className="m-0 font-medium">{building.floors ?? "—"}</dd></div>
            <div className="col-span-2 flex flex-col gap-0.5">
              <dt className="text-base-content/60">Location</dt>
              <dd className="m-0 font-medium">{building.state}, {building.city}{building.district ? `, ${building.district}` : ''}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <h3 className={`m-0 ${LABEL}`}>Stations</h3>
            {stations.length > 0 ? (
              <ul className="m-0 flex list-none flex-col p-0 text-sm">
                {stations.map((station, index) => (
                  <li key={index} className="flex flex-wrap justify-between gap-2 border-t border-base-300/60 py-2">
                    <span>{station.line} · {station.station}</span>
                    <span className="tabular-nums text-base-content/70">{station.walking_minutes} min walk</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-base-content/70">No station information available</p>
            )}
          </div>
        </div>

        {building.main_image_url && (
          <img
            src={building.main_image_url}
            alt={building.title || building.address}
            className="h-auto w-full rounded-field object-cover"
          />
        )}
      </section>

      {/* Rental Units */}
      <section aria-labelledby="units-h" className={`${PANEL} overflow-hidden`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-base-300 px-5 py-4">
          <h2 id="units-h" className="m-0 text-lg font-semibold">
            Rental units <span className="font-medium tabular-nums text-base-content/60">({pagination.totalItems})</span>
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-base-200/60">
              <tr className="text-left">
                <th scope="col" className={HEAD_CELL}>ID</th>
                <th scope="col" className={HEAD_CELL}>Floor</th>
                <th scope="col" className={HEAD_CELL}>Layout</th>
                <th scope="col" className={HEAD_CELL}>Size</th>
                <th scope="col" className={`${HEAD_CELL} text-right`}>Rent</th>
                <th scope="col" className={`${HEAD_CELL} text-right`}>Management fee</th>
                <th scope="col" className={HEAD_CELL}>Last updated</th>
                <th scope="col" className={HEAD_CELL}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rentalUnits.map((unit) => (
                <tr key={unit.id} className="border-t border-base-300/60 hover:bg-base-200/50">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-base-content/70">{unit.id}</td>
                  <td className="whitespace-nowrap px-4 py-3">{unit.floor}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{unit.layout}</td>
                  <td className="whitespace-nowrap px-4 py-3">{unit.size_text || `${unit.size} m²`}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{unit.rent_text || `¥${unit.rent.toLocaleString()}`}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-base-content/80">{unit.management_fee_text || `¥${unit.management_fee.toLocaleString()}`}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-base-content/70">{new Date(unit.last_updated).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      to={`/admin/rentals/unit/${unit.id}`}
                      className="inline-flex min-h-11 items-center px-2 font-semibold text-primary no-underline hover:underline"
                    >
                      Details
                    </Link>
                  </td>
                </tr>
              ))}
              {rentalUnits.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-base-content/70">No rental units for this building</td>
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
            pageHref={(p) => `/admin/rentals/building/${building.id}?page=${p}`}
          />
        </div>
      </section>
    </>
  );
}
