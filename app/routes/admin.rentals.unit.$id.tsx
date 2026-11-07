import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import prisma from '../utils/db.server.js';
import { BUTTON_SECONDARY, LABEL, PageHeader, PANEL } from "../components/AdminUi.js";
import { parseStations } from "../utils/stations.js";

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

const HEAD_CELL = "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.05em] text-base-content/70";

export default function RentalUnitDetails() {
  const { rentalUnit } = useLoaderData<typeof loader>();
  
  // Parse stations JSON
  const stations = parseStations(rentalUnit.building.stations);
  
  // Parse image URLs if they exist
  const imageUrls = rentalUnit.image_urls ? rentalUnit.image_urls.split(',') : [];

  return (
    <>
      <PageHeader
        title="Rental Unit Details"
        description={`Unit #${rentalUnit.id} · ${rentalUnit.building.title || rentalUnit.building.address}`}
        actions={
          <Link to={`/admin/rentals/building/${rentalUnit.building_id}`} className={BUTTON_SECONDARY}>
            Back to building
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Unit Details */}
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="unit-h" className={`${PANEL} flex flex-col gap-6 p-6`}>
            <h2 id="unit-h" className="m-0 text-lg font-semibold">Unit information</h2>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <h3 className={`m-0 ${LABEL}`}>Basic details</h3>
                <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Layout</dt><dd className="m-0 font-medium">{rentalUnit.layout ?? "—"}</dd></div>
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Floor</dt><dd className="m-0 font-medium">{rentalUnit.floor ?? "—"}</dd></div>
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Size</dt><dd className="m-0 font-medium">{rentalUnit.size_text || `${rentalUnit.size} m²`}</dd></div>
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Rent</dt><dd className="m-0 font-semibold tabular-nums">{rentalUnit.rent_text || `¥${rentalUnit.rent.toLocaleString()}`}</dd></div>
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Management fee</dt><dd className="m-0 font-medium tabular-nums">{rentalUnit.management_fee_text || `¥${rentalUnit.management_fee.toLocaleString()}`}</dd></div>
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Deposit</dt><dd className="m-0 font-medium">{rentalUnit.deposit ?? "—"}</dd></div>
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Gratuity</dt><dd className="m-0 font-medium">{rentalUnit.gratuity ?? "—"}</dd></div>
                </dl>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className={`m-0 ${LABEL}`}>Building information</h3>
                <dl className="m-0 grid gap-x-4 gap-y-3 text-sm">
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Building</dt><dd className="m-0 font-medium">{rentalUnit.building.title || rentalUnit.building.address}</dd></div>
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Type</dt><dd className="m-0 font-medium">{rentalUnit.building.building_type}</dd></div>
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Age</dt><dd className="m-0 font-medium">{rentalUnit.building.age ?? "—"}</dd></div>
                  <div className="flex flex-col gap-0.5"><dt className="text-base-content/60">Address</dt><dd className="m-0 font-medium">{rentalUnit.building.address}</dd></div>
                </dl>

                <h3 className={`m-0 mt-2 ${LABEL}`}>Stations</h3>
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

            {/* Tags */}
            {rentalUnit.tags && (
              <div className="flex flex-col gap-2">
                <h3 className={`m-0 ${LABEL}`}>Tags</h3>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {rentalUnit.tags.split(',').map((tag, index) => (
                    <li key={index} className="rounded-field border border-base-300 px-3 py-1.5 text-sm font-medium">
                      {tag.trim()}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* External Link */}
            <div>
              <a
                href={rentalUnit.url}
                target="_blank"
                rel="noopener noreferrer"
                className={BUTTON_SECONDARY}
              >
                View on SUUMO
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
              </a>
            </div>
          </section>

          {/* Price History */}
          <section aria-labelledby="history-h" className={`${PANEL} overflow-hidden`}>
            <h2 id="history-h" className="m-0 border-b border-base-300 px-5 py-4 text-lg font-semibold">Price history</h2>

            {rentalUnit.rentalPriceHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead className="bg-base-200/60">
                    <tr className="text-left">
                      <th scope="col" className={HEAD_CELL}>Date</th>
                      <th scope="col" className={`${HEAD_CELL} text-right`}>Rent</th>
                      <th scope="col" className={`${HEAD_CELL} text-right`}>Management fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rentalUnit.rentalPriceHistory.map((history) => (
                      <tr key={history.id} className="border-t border-base-300/60 hover:bg-base-200/50">
                        <td className="whitespace-nowrap px-4 py-3">{new Date(history.recorded_at).toLocaleDateString()}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{history.rent_text || `¥${history.rent.toLocaleString()}`}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-base-content/80">{history.management_fee_text || `¥${history.management_fee.toLocaleString()}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="m-0 px-5 py-4 text-sm text-base-content/70">No price history available</p>
            )}
          </section>
        </div>

        {/* Images */}
        <section aria-labelledby="images-h" className={`${PANEL} flex min-w-0 flex-col gap-4 self-start p-6`}>
          <h2 id="images-h" className="m-0 text-lg font-semibold">Images</h2>

          {rentalUnit.thumbnail_url && (
            <img src={rentalUnit.thumbnail_url} alt="Thumbnail" className="h-auto w-full rounded-field" />
          )}

          {imageUrls.length > 0 ? (
            imageUrls.map((url, index) => (
              <img key={index} src={url.trim()} alt={`Image ${index + 1}`} className="h-auto w-full rounded-field" />
            ))
          ) : (
            !rentalUnit.thumbnail_url && (
              <p className="m-0 text-sm text-base-content/70">No images available</p>
            )
          )}
        </section>
      </div>
    </>
  );
}
