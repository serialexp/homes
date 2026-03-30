import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import prisma from '../utils/db.server.js';
import { areas } from "../data/propertyData.js";
import { translateWithCache } from "../utils/llm.server.js";
import { type Building, type RentalUnit, type TrainLine, type Station, type BuildingStation, Prisma } from "@prisma/client";
import { useState } from "react";

// For rentals, we only have one type (040)
const RENTAL_TYPE_ID = '040';
const RENTAL_TYPE_NAME = 'Rental';

const ITEMS_PER_PAGE = 10;

// Price ranges in JPY
const PRICE_RANGES = [
  { min: 0, max: 50000, label: "Under ¥50,000" },
  { min: 50000, max: 75000, label: "¥50,000 - ¥75,000" },
  { min: 75000, max: 100000, label: "¥75,000 - ¥100,000" },
  { min: 100000, max: 150000, label: "¥100,000 - ¥150,000" },
  { min: 150000, max: 200000, label: "¥150,000 - ¥200,000" },
  { min: 200000, max: 300000, label: "¥200,000 - ¥300,000" },
  { min: 300000, max: null, label: "Over ¥300,000" }
];

type LoaderBuilding = Building & {
  buildingStations: (BuildingStation & {
    station: Station & {
      train_line: TrainLine
    }
  })[];
  rentalUnits: RentalUnit[];
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { typeId, areaId, provinceId } = params;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const trainLineId = url.searchParams.get("trainLine");
  const stationId = url.searchParams.get("station");
  const minPrice = url.searchParams.get("minPrice") ? parseInt(url.searchParams.get("minPrice")!, 10) : null;
  const maxPrice = url.searchParams.get("maxPrice") ? parseInt(url.searchParams.get("maxPrice")!, 10) : null;
  const skip = (page - 1) * ITEMS_PER_PAGE;
  
  if (typeId !== RENTAL_TYPE_ID) {
    throw new Response("Invalid property type", { status: 404 });
  }
  
  if (!areaId || !areas[areaId as keyof typeof areas]) {
    throw new Response("Invalid area", { status: 404 });
  }
  
  const area = areas[areaId as keyof typeof areas];
  if (!provinceId || !area.provinces[provinceId as keyof typeof area.provinces]) {
    throw new Response("Invalid province", { status: 404 });
  }

  const provinceName = area.provinces[provinceId as keyof typeof area.provinces];
  const regionName = area.name;

  // Get all train lines that have stations near buildings in this area
  const trainLines = await prisma.trainLine.findMany({
    where: {
      stations: {
        some: {
          buildingStations: {
            some: {
              building: {
                region: areaId,
                province: provinceId
              }
            }
          }
        }
      }
    },
    orderBy: {
      translated_name: 'asc'
    }
  });

  // Get stations for the selected train line
  const stations = trainLineId ? await prisma.station.findMany({
    where: {
      train_line_id: parseInt(trainLineId, 10),
      buildingStations: {
        some: {
          building: {
            region: areaId,
            province: provinceId
          }
        }
      }
    },
    orderBy: {
      name: 'asc'
    }
  }) : [];

  // Base query for buildings
  const buildingQuery = {
    where: {
      region: areaId,
      province: provinceId,
      ...(stationId ? {
        buildingStations: {
          some: {
            station_id: parseInt(stationId, 10)
          }
        }
      } : trainLineId ? {
        buildingStations: {
          some: {
            station: {
              train_line_id: parseInt(trainLineId, 10)
            }
          }
        }
      } : {}),
      rentalUnits: {
        some: {
          AND: [
            ...(minPrice ? [{ rent: { gte: minPrice } }] : []),
            ...(maxPrice ? [{ rent: { lte: maxPrice } }] : [])
          ]
        }
      }
    },
    include: {
      buildingStations: {
        include: {
          station: {
            include: {
              train_line: true
            }
          }
        }
      },
      rentalUnits: {
        orderBy: {
          rent: Prisma.SortOrder.asc
        },
        where: {
          AND: [
            ...(minPrice ? [{ rent: { gte: minPrice } }] : []),
            ...(maxPrice ? [{ rent: { lte: maxPrice } }] : [])
          ]
        },
        take: 20 // Limit to 20 units per building
      }
    },
    orderBy: {
      last_updated: 'desc' as const
    },
    skip,
    take: ITEMS_PER_PAGE
  } satisfies Prisma.BuildingFindManyArgs;

  // Get buildings with their rental units
  const buildings = await prisma.building.findMany(buildingQuery);

  // Get total count for pagination
  const totalBuildings = await prisma.building.count({
    where: buildingQuery.where
  });

  // Collect all unique Japanese strings that need translation
  const textsToTranslate: string[] = [];
  for (const building of buildings) {
    if (building.building_type) textsToTranslate.push(building.building_type);
    if (building.age) textsToTranslate.push(building.age);
    if (building.floors) textsToTranslate.push(building.floors);
    if (building.state) textsToTranslate.push(building.state);
    if (building.city) textsToTranslate.push(building.city);
    if (building.district) textsToTranslate.push(building.district);
  }

  // Batch translate (cache-backed, only calls LLM for new strings)
  let translations = new Map<string, string>();
  try {
    translations = await translateWithCache(textsToTranslate);
  } catch (error) {
    console.error("Translation failed, showing original Japanese:", error);
  }

  return json({
    buildings,
    translations: Object.fromEntries(translations),
    trainLines,
    stations,
    priceRanges: PRICE_RANGES,
    selectedTrainLine: trainLineId ? trainLines.find(line => line.id === parseInt(trainLineId, 10)) : null,
    selectedStation: stationId ? stations.find(station => station.id === parseInt(stationId, 10)) : null,
    selectedPriceRange: minPrice || maxPrice ? { min: minPrice, max: maxPrice } : null,
    countTotal: totalBuildings,
    currentPage: page,
    totalPages: Math.ceil(totalBuildings / ITEMS_PER_PAGE),
    selectedType: {
      id: typeId,
      name: RENTAL_TYPE_NAME
    },
    selectedArea: {
      id: areaId,
      name: regionName
    },
    selectedProvince: {
      id: provinceId,
      name: provinceName
    }
  });
}

export default function RentalPropertiesPage() {
  const {
    buildings,
    translations,
    trainLines,
    stations,
    priceRanges,
    selectedTrainLine,
    selectedStation,
    selectedPriceRange,
    selectedType,
    selectedArea,
    selectedProvince,
    countTotal,
    currentPage,
    totalPages 
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Look up a cached translation, falling back to the original text
  const t = (text: string | null | undefined) => {
    if (!text) return "-";
    return translations[text] || text;
  };

  // Format price in Japanese yen (¥)
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0
    }).format(price);
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    searchParams.set("page", newPage.toString());
    setSearchParams(searchParams);
  };

  // Handle train line filter
  const handleTrainLineChange = (trainLineId: string | null) => {
    if (trainLineId) {
      searchParams.set("trainLine", trainLineId);
    } else {
      searchParams.delete("trainLine");
    }
    searchParams.delete("station"); // Clear station when train line changes
    searchParams.set("page", "1"); // Reset to first page when filter changes
    setSearchParams(searchParams);
  };

  // Handle station filter
  const handleStationChange = (stationId: string | null) => {
    if (stationId) {
      searchParams.set("station", stationId);
    } else {
      searchParams.delete("station");
    }
    searchParams.set("page", "1"); // Reset to first page when filter changes
    setSearchParams(searchParams);
  };

  // Handle price range filter
  const handlePriceRangeChange = (range: { min: number | null, max: number | null } | null) => {
    if (range) {
      if (range.min) searchParams.set("minPrice", range.min.toString());
      else searchParams.delete("minPrice");
      if (range.max) searchParams.set("maxPrice", range.max.toString());
      else searchParams.delete("maxPrice");
    } else {
      searchParams.delete("minPrice");
      searchParams.delete("maxPrice");
    }
    searchParams.set("page", "1"); // Reset to first page when filter changes
    setSearchParams(searchParams);
  };

  // Format relative time from a date string
  const formatAge = (dateStr: string) => {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "1 day ago";
    if (days < 7) return `${days} days ago`;
    if (days < 14) return "1 week ago";
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 60) return "1 month ago";
    return `${Math.floor(days / 30)} months ago`;
  };

  // Close image modal
  const closeImageModal = () => {
    setSelectedImage(null);
  };

  return (
    <div className="container mx-auto p-4">
      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75" onClick={closeImageModal}>
          <div className="relative max-w-4xl max-h-[90vh] p-2 bg-white rounded-lg" onClick={e => e.stopPropagation()}>
            <button 
              onClick={closeImageModal}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              aria-label="Close modal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img 
              src={selectedImage} 
              alt="Full size view" 
              className="max-h-[85vh] w-auto mx-auto"
            />
          </div>
        </div>
      )}

      <div className="mb-6">
        <Link to={`/rental/areas/${selectedType.id}`} className="text-blue-600 hover:underline">
          ← Back to Areas
        </Link>
        <h2 className="text-2xl font-bold mt-2">
          {selectedType.name} Properties in {selectedProvince.name}, {selectedArea.name}
        </h2>
        <p className="text-gray-600 mt-1">Found {countTotal} buildings</p>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Train Line Filter */}
        <div className="form-control w-full">
          <label className="label">
            <span className="label-text">Filter by Train Line</span>
          </label>
          <select 
            className="select select-bordered w-full"
            value={selectedTrainLine?.id || ""}
            onChange={(e) => handleTrainLineChange(e.target.value || null)}
          >
            <option value="">All Lines</option>
            {trainLines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.translated_name || line.name}
              </option>
            ))}
          </select>
        </div>

        {/* Station Filter */}
        <div className="form-control w-full">
          <label className="label">
            <span className="label-text">Filter by Station</span>
          </label>
          <select 
            className="select select-bordered w-full"
            value={selectedStation?.id || ""}
            onChange={(e) => handleStationChange(e.target.value || null)}
            disabled={!selectedTrainLine}
          >
            <option value="">All Stations</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.translated_name || station.name}
              </option>
            ))}
          </select>
        </div>

        {/* Price Range Filter */}
        <div className="form-control w-full">
          <label className="label">
            <span className="label-text">Filter by Price Range</span>
          </label>
          <select 
            className="select select-bordered w-full"
            value={selectedPriceRange ? `${selectedPriceRange.min}-${selectedPriceRange.max}` : ""}
            onChange={(e) => {
              if (!e.target.value) {
                handlePriceRangeChange(null);
              } else {
                const [min, max] = e.target.value.split("-").map(v => v === "null" ? null : parseInt(v, 10));
                handlePriceRangeChange({ min, max });
              }
            }}
          >
            <option value="">Any Price</option>
            {priceRanges.map((range, index) => (
              <option key={index} value={`${range.min}-${range.max}`}>
                {range.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {buildings.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p>No rental properties found matching these criteria.</p>
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {buildings.map((building) => (
              <div key={building.id} className="bg-white border border-gray-200 rounded-lg shadow overflow-hidden">
                {/* Building Information */}
                <div className="p-3 sm:p-6 border-b border-gray-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
                    <div>
                      <h3 className="text-lg sm:text-xl font-semibold mb-2">{building.title || building.address}</h3>
                      <div className="text-sm space-y-1">
                        <p><span className="font-medium">Address:</span> {[t(building.district), t(building.city), t(building.state)].filter(s => s && s !== "-").join(", ")}</p>
                        <p><span className="font-medium">Type:</span> {t(building.building_type)} · <span className="font-medium">Age:</span> {t(building.age)} · <span className="font-medium">Floors:</span> {t(building.floors)}</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-sm mb-1">Stations:</h4>
                      {(() => {
                        try {
                          return (
                            <ul className="list-disc pl-5 space-y-1">
                              {building.buildingStations.map((station) => (
                                <li 
                                  key={station.id} 
                                  className={`${
                                    (selectedStation?.id === station.station.id || 
                                    (!selectedStation && selectedTrainLine?.id === station.station.train_line.id))
                                      ? "font-bold" 
                                      : ""
                                  }`}
                                >
                                  {station.station.train_line.translated_name || station.station.train_line.name} - {station.station.translated_name || station.station.name} ({station.walking_minutes} min walk)
                                </li>
                              ))}
                            </ul>
                          );
                        } catch {
                          return <p className="text-gray-500">No station information available</p>;
                        }
                      })()}
                    </div>
                  </div>
                </div>

                {/* Rental Units */}
                <div className="p-3 sm:p-6">
                  <h4 className="font-medium mb-3">Available Units ({building.rentalUnits.length})</h4>

                  {/* Mobile: card layout */}
                  <div className="sm:hidden space-y-3">
                    {building.rentalUnits.map((unit) => (
                      <div key={unit.id} className="flex gap-3 p-2 bg-gray-50 rounded-lg">
                        <div className="flex-shrink-0">
                          {unit.image_urls?.split(',').slice(0, 1).map((image: string, index: number) => (
                            <img
                              key={index}
                              src={image}
                              className="w-20 h-20 object-cover rounded cursor-pointer"
                              onClick={() => setSelectedImage(image)}
                              alt={`Unit ${index + 1}`}
                            />
                          ))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <span className="font-semibold text-lg">{unit.rent_text || formatPrice(unit.rent)}</span>
                            <a
                              href={unit.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex-shrink-0"
                            >
                              Suumo
                            </a>
                          </div>
                          <div className="text-sm text-gray-600 mt-0.5">
                            {unit.layout} · {unit.size_text || `${unit.size}m²`} · {unit.floor}F
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Mgmt {unit.management_fee_text || formatPrice(unit.management_fee)} · Dep {unit.deposit || '-'} · Grat {unit.gratuity || '-'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop: table layout */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="bg-gray-50">
                          <th></th>
                          <th className="py-2 px-3 text-left text-sm">Floor</th>
                          <th className="py-2 px-3 text-left text-sm">Layout</th>
                          <th className="py-2 px-3 text-left text-sm">Size</th>
                          <th className="py-2 px-3 text-right text-sm">Rent</th>
                          <th className="py-2 px-3 text-right text-sm">Mgmt Fee</th>
                          <th className="py-2 px-3 text-left text-sm">Dep/Grat</th>
                          <th className="py-2 px-3 text-left text-sm">Listed</th>
                          <th className="py-2 px-3 text-center text-sm">Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {building.rentalUnits.map((unit) => (
                          <tr key={unit.id} className="hover:bg-gray-50">
                            <td className="py-1 px-2">
                              <div className="flex gap-1">
                                {unit.image_urls?.split(',').slice(0, 2).map((image: string, index: number) => (
                                  <img
                                    key={index}
                                    src={image}
                                    className="w-14 h-14 object-cover rounded cursor-pointer hover:opacity-90"
                                    onClick={() => setSelectedImage(image)}
                                    alt={`Unit ${index + 1}`}
                                  />
                                ))}
                              </div>
                            </td>
                            <td className="py-1 px-3 text-sm">{unit.floor}</td>
                            <td className="py-1 px-3 text-sm">{unit.layout}</td>
                            <td className="py-1 px-3 text-sm">{unit.size_text || `${unit.size}m²`}</td>
                            <td className="py-1 px-3 text-right text-sm font-medium">
                              {unit.rent_text || formatPrice(unit.rent)}
                            </td>
                            <td className="py-1 px-3 text-right text-sm">
                              {unit.management_fee_text || formatPrice(unit.management_fee)}
                            </td>
                            <td className="py-1 px-3 text-sm">
                              <div>{unit.deposit || '-'} / {unit.gratuity || '-'}</div>
                            </td>
                            <td className="py-1 px-3 text-xs text-gray-600">
                              {formatAge(unit.insert_date as unknown as string)}
                            </td>
                            <td className="py-1 px-3 text-center">
                              <a
                                href={unit.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                              >
                                Suumo
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {building.rentalUnits.length === 20 && (
                    <div className="mt-3 text-center text-xs text-gray-500">
                      Showing first 20 units by rent.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex justify-center">
              <nav className="flex items-center">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className={`mx-1 px-3 py-1 rounded ${
                    currentPage <= 1 
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Previous
                </button>
                
                <div className="flex mx-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`mx-1 px-3 py-1 rounded ${
                          currentPage === pageNum
                            ? 'bg-blue-700 text-white'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  {totalPages > 5 && currentPage < totalPages - 2 && (
                    <>
                      <span className="mx-1">...</span>
                      <button
                        onClick={() => handlePageChange(totalPages)}
                        className="mx-1 px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                      >
                        {totalPages}
                      </button>
                    </>
                  )}
                </div>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className={`mx-1 px-3 py-1 rounded ${
                    currentPage >= totalPages
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Next
                </button>
              </nav>
            </div>
          )}
        </>
      )}
    </div>
  );
} 