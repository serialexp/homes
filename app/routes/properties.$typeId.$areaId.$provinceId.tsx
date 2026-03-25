import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { PrismaClient, Property } from "@prisma/client";
import { propertyTypes, areas } from "../data/propertyData.js";
import { useState, useEffect } from "react";
import { translateAndUpdateProperties } from "../utils/translation.server.js";

// Map property type IDs to property_type values in the database
const propertyTypeMapping = {
  '030': 'Land',
  '021': 'Second-hand house',
  '020': 'New house',
  '011': 'Second-hand mansion',
  '010': 'New mansion'
};

const ITEMS_PER_PAGE = 12;
const prisma = new PrismaClient();

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { typeId, areaId, provinceId } = params;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const skip = (page - 1) * ITEMS_PER_PAGE;
  
  if (!typeId || !propertyTypes[typeId as keyof typeof propertyTypes]) {
    throw new Response("Invalid property type", { status: 404 });
  }
  
  if (!areaId || !areas[areaId as keyof typeof areas]) {
    throw new Response("Invalid area", { status: 404 });
  }
  
  const area = areas[areaId as keyof typeof areas];
  if (!provinceId || !area.provinces[provinceId as keyof typeof area.provinces]) {
    throw new Response("Invalid province", { status: 404 });
  }

  const propertyType = propertyTypeMapping[typeId as keyof typeof propertyTypeMapping];
  const provinceName = area.provinces[provinceId as keyof typeof area.provinces];
  const regionName = area.name;
  
  // Query the database for properties matching the criteria
  const countTotal = await prisma.property.count({
    where: {
      type: typeId,
      region: areaId,
      province: provinceId
    }
  });
  
  const properties = await prisma.property.findMany({
    where: {
      type: typeId,
      region: areaId,
      province: provinceId
    },
    orderBy: {
      price: 'asc'
    },
    skip,
    take: ITEMS_PER_PAGE
  });

  // Translate property names and titles if needed
  const translatedProperties = await translateAndUpdateProperties(properties);

  return json({
    properties: translatedProperties,
    countTotal,
    currentPage: page,
    totalPages: Math.ceil(countTotal / ITEMS_PER_PAGE),
    selectedType: {
      id: typeId,
      name: propertyTypes[typeId as keyof typeof propertyTypes]
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

export default function PropertiesPage() {
  const { properties, selectedType, selectedArea, selectedProvince, countTotal, currentPage, totalPages } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedProperty, setSelectedProperty] = useState<(Property & { 
    translated_property_name?: string | null;
    translated_title?: string | null;
  }) | null>(null);
  const [additionalImages, setAdditionalImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Format price in Japanese yen (¥)
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0
    }).format(price);
  };
  
  // Format area in square meters (m²)
  const formatArea = (area: number) => {
    return `${area.toLocaleString()} m²`;
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    searchParams.set("page", newPage.toString());
    setSearchParams(searchParams);
  };

  // Open property details modal
  const openPropertyDetails = (property: Property & { 
    translated_property_name?: string | null;
    translated_title?: string | null;
  }) => {
    setSelectedProperty(property);
    setCurrentImageIndex(0);
    
    // Parse additional images if available
    if (property.additional_image_urls) {
      try {
        const images = property.additional_image_urls.split(',').map((url: string) => url.trim());
        setAdditionalImages(images);
      } catch (error) {
        setAdditionalImages([]);
      }
    } else {
      setAdditionalImages([]);
    }
  };

  // Close property details modal
  const closePropertyDetails = () => {
    setSelectedProperty(null);
    setAdditionalImages([]);
  };
  
  // Navigate to next image
  const nextImage = () => {
    const totalImages = additionalImages.length + 1; // +1 for main image
    setCurrentImageIndex((currentImageIndex + 1) % totalImages);
  };
  
  // Navigate to previous image
  const prevImage = () => {
    const totalImages = additionalImages.length + 1; // +1 for main image
    setCurrentImageIndex((currentImageIndex - 1 + totalImages) % totalImages);
  };
  
  // Parse and optimize image URL
  const optimizeImageUrl = (url: string | null | undefined, width: number, height: number): string => {
    if (!url) return 'https://placehold.co/600x400';
    
    try {
      // Check if it's a URL that supports width and height parameters
      const parsedUrl = new URL(url);
      
      // If the URL contains query parameters for width and height, update them
      if (parsedUrl.searchParams.has('w') || parsedUrl.searchParams.has('h')) {
        parsedUrl.searchParams.set('w', width.toString());
        parsedUrl.searchParams.set('h', height.toString());
        return parsedUrl.toString();
      }
      
      // If it's an image hosting service that uses path parameters for dimensions
      // Example: some-cdn.com/600x400/image.jpg
      const pathParts = parsedUrl.pathname.split('/');
      for (let i = 0; i < pathParts.length; i++) {
        if (pathParts[i].match(/^\d+x\d+$/)) {
          pathParts[i] = `${width}x${height}`;
          parsedUrl.pathname = pathParts.join('/');
          return parsedUrl.toString();
        }
      }
      
      return url;
    } catch (error) {
      // If URL parsing fails, return the original URL
      return url;
    }
  };
  
  // Get current image URL with optimized dimensions
  const getCurrentImageUrl = () => {
    if (currentImageIndex === 0) {
      return optimizeImageUrl(selectedProperty?.main_image_url, 800, 600);
    } else {
      return optimizeImageUrl(additionalImages[currentImageIndex - 1], 800, 600);
    }
  };

  // Display property name with translation if available
  const getPropertyName = (property: Property & { translated_property_name?: string | null }) => {
    if (property.translated_property_name) {
      return (
        <div>
          <div>{property.property_name}</div>
          <div className="text-gray-500 italic text-sm">{property.translated_property_name}</div>
        </div>
      );
    }
    return property.property_name;
  };

  // Display property title with translation if available
  const getPropertyTitle = (property: Property & { translated_title?: string | null }) => {
    if (property.translated_title) {
      return (
        <div>
          <div>{property.title}</div>
          <div className="text-gray-500 italic text-sm">{property.translated_title}</div>
        </div>
      );
    }
    return property.title;
  };

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <Link to={`/areas/${selectedType.id}`} className="text-blue-600 hover:underline">
          ← Back to Areas
        </Link>
        <h2 className="text-2xl font-bold mt-2">
          {selectedType.name} Properties in {selectedProvince.name}, {selectedArea.name}
        </h2>
        <p className="text-gray-600 mt-1">Found {countTotal} properties</p>
      </div>
      
      {properties.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
          <p>No properties found matching these criteria.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map((property) => (
              <div key={property.id} className="bg-white border border-gray-200 rounded-lg shadow overflow-hidden">
                <div className="p-5">
                  <h3 className="text-xl font-semibold mb-2 truncate">{property.address}</h3>
                  <img 
                    src={optimizeImageUrl(property.main_image_url, 400, 300)} 
                    alt={property.property_name ?? 'Property image'} 
                    className="w-full h-40 object-cover mb-2" 
                  />
                  <div className="flex justify-between mb-2">
                    <span className="text-2xl font-bold text-green-700">{formatPrice(property.price)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                    <div>
                      <span className="text-gray-600">Area:</span> {formatArea(property.area)}
                    </div>
                    {property.building_area > 0 && (
                      <div>
                        <span className="text-gray-600">Building:</span> {formatArea(property.building_area)}
                      </div>
                    )}
                    <div>
                      <span className="text-gray-600">Station:</span> {property.train_station}
                    </div>
                    <div>
                      <span className="text-gray-600">Distance:</span> {property.station_distance} min walk
                    </div>
                    {property.property_name && (
                      <div className="col-span-2 mt-2">
                        <span className="text-gray-600">Name:</span> {getPropertyName(property)}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => openPropertyDetails(property)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded"
                    >
                      Details
                    </button>
                    <a 
                      href={property.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="block text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
                    >
                      Website
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination controls */}
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
                  // Show pages around current page
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
        </>
      )}

      {/* Property Details Modal */}
      {selectedProperty && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold">{selectedProperty.address}</h2>
                <button 
                  onClick={closePropertyDetails}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  {/* Image gallery */}
                  <div className="relative mb-4">
                    <img 
                      src={getCurrentImageUrl()} 
                      alt={selectedProperty.property_name ?? 'Property image'} 
                      className="w-full h-64 object-cover rounded-lg" 
                    />
                    
                    {/* Image navigation buttons */}
                    {(additionalImages.length > 0) && (
                      <div className="absolute inset-0 flex items-center justify-between px-2">
                        <button 
                          onClick={prevImage}
                          className="bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 focus:outline-none"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button 
                          onClick={nextImage}
                          className="bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 focus:outline-none"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    )}
                    
                    {/* Image counter */}
                    {(additionalImages.length > 0) && (
                      <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                        {currentImageIndex + 1} / {additionalImages.length + 1}
                      </div>
                    )}
                  </div>
                  
                  {/* Thumbnail navigation */}
                  {additionalImages.length > 0 && (
                    <div className="flex overflow-x-auto space-x-2 mb-4 pb-2">
                      <button 
                        onClick={() => setCurrentImageIndex(0)}
                        className={`flex-shrink-0 w-16 h-16 rounded ${currentImageIndex === 0 ? 'ring-2 ring-blue-500' : ''}`}
                      >
                        <img 
                          src={optimizeImageUrl(selectedProperty.main_image_url, 100, 100)} 
                          alt="Main" 
                          className="w-full h-full object-cover rounded" 
                        />
                      </button>
                      {additionalImages.map((url, index) => (
                        <button 
                          key={index}
                          onClick={() => setCurrentImageIndex(index + 1)}
                          className={`flex-shrink-0 w-16 h-16 rounded ${currentImageIndex === index + 1 ? 'ring-2 ring-blue-500' : ''}`}
                        >
                          <img 
                            src={optimizeImageUrl(url, 100, 100)} 
                            alt={`Image ${index + 1}`} 
                            className="w-full h-full object-cover rounded" 
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <div className="text-3xl font-bold text-green-700 mb-4">
                    {formatPrice(selectedProperty.price)}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-y-2 mb-4">
                    <div className="col-span-2">
                      <span className="font-semibold">Address:</span> {selectedProperty.address}
                    </div>
                    <div>
                      <span className="font-semibold">Land Area:</span> {formatArea(selectedProperty.area)}
                    </div>
                    {selectedProperty.building_area > 0 && (
                      <div>
                        <span className="font-semibold">Building Area:</span> {formatArea(selectedProperty.building_area)}
                      </div>
                    )}
                    <div>
                      <span className="font-semibold">Train Line:</span> {selectedProperty.train_line}
                    </div>
                    <div>
                      <span className="font-semibold">Station:</span> {selectedProperty.train_station}
                    </div>
                    <div>
                      <span className="font-semibold">Distance:</span> {selectedProperty.station_distance} min walk
                    </div>
                    {selectedProperty.property_name && (
                      <div className="col-span-2">
                        <span className="font-semibold">Property Name:</span> {getPropertyName(selectedProperty)}
                      </div>
                    )}
                    {selectedProperty.title && (
                      <div className="col-span-2">
                        <span className="font-semibold">Title:</span> {getPropertyTitle(selectedProperty)}
                      </div>
                    )}
                    <div>
                      <span className="font-semibold">Property Type:</span> {selectedProperty.property_type}
                    </div>
                    {selectedProperty.building_coverage !== null && selectedProperty.building_coverage > 0 && (
                      <div>
                        <span className="font-semibold">Building Coverage:</span> {selectedProperty.building_coverage}%
                      </div>
                    )}
                    {selectedProperty.floor_area_ratio !== null && selectedProperty.floor_area_ratio > 0 && (
                      <div>
                        <span className="font-semibold">Floor Area Ratio:</span> {selectedProperty.floor_area_ratio}%
                      </div>
                    )}
                    {selectedProperty.coverage > 0 && (
                      <div>
                        <span className="font-semibold">Coverage:</span> {selectedProperty.coverage}%
                      </div>
                    )}
                    {selectedProperty.volume > 0 && (
                      <div>
                        <span className="font-semibold">Volume:</span> {selectedProperty.volume}%
                      </div>
                    )}
                    {selectedProperty.postal_code && (
                      <div>
                        <span className="font-semibold">Postal Code:</span> {selectedProperty.postal_code}
                      </div>
                    )}
                    <div className="col-span-2">
                      <span className="font-semibold">Last Updated:</span> {new Date(selectedProperty.last_updated).toLocaleDateString()}
                    </div>
                  </div>
                  
                  <a 
                    href={selectedProperty.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
                  >
                    View on Website
                  </a>
                </div>
                
                <div>
                  {selectedProperty.additional_fields && (
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold mb-2">Additional Information</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <pre className="whitespace-pre-wrap text-sm">
                          {selectedProperty.additional_fields}
                        </pre>
                      </div>
                    </div>
                  )}
                  
                  {selectedProperty.property_tags && (
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold mb-2">Property Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedProperty.property_tags.split(',').map((tag: string, index: number) => (
                          <span key={index} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 