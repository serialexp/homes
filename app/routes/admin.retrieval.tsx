import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation, useSubmit, Link } from "@remix-run/react";
import { useEffect, useState } from "react";
import { propertyTypes, areas } from "../data/propertyData.js";
import { startRetrieval, getRetrievalProcessStatus, cancelRetrieval } from "../services/retrieveCommandService.server.js";

export async function loader({ request }: LoaderFunctionArgs) {
  const status = await getRetrievalProcessStatus();
  return json({ status, propertyTypes, areas });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const action = formData.get("_action") as string;
  
  if (action === "cancel") {
    try {
      const success = await cancelRetrieval();
      return json({ 
        success, 
        message: success 
          ? "Cancellation request sent. The process will stop after the current page completes." 
          : "No active retrieval process to cancel" 
      });
    } catch (error) {
      return json({ 
        success: false, 
        message: error instanceof Error ? error.message : "An error occurred while cancelling" 
      }, { status: 400 });
    }
  }
  
  // Handle start retrieval action
  const type = formData.get("type") as string;
  const region = formData.get("region") as string;
  const province = formData.get("province") as string;
  const refresh = formData.get("refresh") === "on";

  try {
    const options: Record<string, any> = { refresh };
    
    if (type && type !== "all") {
      options.type = type;
    }
    
    if (region && region !== "all") {
      options.region = region;
    }
    
    if (province && province !== "all") {
      options.province = province;
    }
    
    await startRetrieval(options);
    return json({ success: true, message: "Retrieval process started successfully" });
  } catch (error) {
    return json({ 
      success: false, 
      message: error instanceof Error ? error.message : "An error occurred" 
    }, { status: 400 });
  }
}

export default function RetrievalPage() {
  const { status, propertyTypes, areas } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const submit = useSubmit();
  
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [currentStatus, setCurrentStatus] = useState(status);
  
  // Refresh status every 2 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch("/admin/retrieval/status");
        const data = await response.json();
        setCurrentStatus(data.status);
      } catch (error) {
        console.error("Error fetching status:", error);
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Handle cancel button click
  const handleCancel = () => {
    const formData = new FormData();
    formData.append("_action", "cancel");
    submit(formData, { method: "post" });
  };
  
// Sections progress
const sectionsToFetch = currentStatus?.sectionsToFetch || 0;
const sectionsProcessed = currentStatus?.sectionsProcessed || 0;
const sectionsProgressPercentage = currentStatus && sectionsToFetch > 0
  ? Math.round((sectionsProcessed / sectionsToFetch) * 100)
  : 0;

  // Calculate progress percentage
  const progressPercentage = currentStatus && currentStatus.total > 0
    ? Math.round((currentStatus.progress / currentStatus.total) * 100)
    : 0;
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold mb-6">Property Data Retrieval</h2>
        <Link 
          to="/admin/retrieval/history" 
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700"
        >
          View History
        </Link>
      </div>
      
      {/* Status Display */}
      {currentStatus && (
        <div className="mb-8 bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">Current Status</h3>
          
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="font-medium">Status: <span className={`font-bold ${
                currentStatus.status === 'running' ? 'text-blue-600' :
                currentStatus.status === 'completed' ? 'text-green-600' :
                currentStatus.status === 'failed' ? 'text-red-600' :
                currentStatus.status === 'cancelled' ? 'text-yellow-600' : ''
              }`}>{currentStatus.status.toUpperCase()}</span></span>
              
              {currentStatus.status === 'running' && (
                <span>{progressPercentage}% Complete</span>
              )}
            </div>
            
            
            {currentStatus.status === 'running' && (
              <>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-green-600 h-2.5 rounded-full" 
                  style={{ width: `${sectionsProgressPercentage}%` }}
                ></div>
              </div>
              <div className="w-full mt-2 bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full" 
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              </>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p><span className="font-medium">Message:</span> {currentStatus.message}</p>
              <p><span className="font-medium">Started:</span> {new Date(currentStatus.startTime).toLocaleString()}</p>
              {currentStatus.status === 'running' && currentStatus.estimatedCompletionTime && (
                <p><span className="font-medium">Estimated Completion:</span> {new Date(currentStatus.estimatedCompletionTime).toLocaleString()}</p>
              )}
            </div>
            <div>
              <p><span className="font-medium">Sections Processed:</span> {sectionsProcessed} / {sectionsToFetch}</p>
              <p><span className="font-medium">Items Processed:</span> {currentStatus.progress} / {currentStatus.total}</p>
              {currentStatus.endTime && (
                <p><span className="font-medium">Completed:</span> {new Date(currentStatus.endTime).toLocaleString()}</p>
              )}
              {currentStatus.error && (
                <p className="text-red-600"><span className="font-medium">Error:</span> {currentStatus.error}</p>
              )}
            </div>
          </div>
          
          {/* Cancel Button */}
          {currentStatus.status === 'running' && (
            <div className="mt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600 text-white font-medium rounded-md hover:bg-red-700 disabled:bg-gray-400"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Cancelling..." : "Cancel Retrieval"}
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Start New Retrieval Form */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl font-semibold mb-4">Start New Retrieval</h3>
        
        {actionData && (
          <div className={`p-4 mb-4 rounded-lg ${actionData.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {actionData.message}
          </div>
        )}
        
        <Form method="post">
          <input type="hidden" name="_action" value="start" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
              <select 
                id="type" 
                name="type" 
                className="w-full p-2 border border-gray-300 rounded-md"
                disabled={isSubmitting || (currentStatus?.status === 'running')}
              >
                <option value="all">All Property Types</option>
                {Object.entries(propertyTypes).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label htmlFor="region" className="block text-sm font-medium text-gray-700 mb-1">Region</label>
              <select 
                id="region" 
                name="region" 
                className="w-full p-2 border border-gray-300 rounded-md"
                disabled={isSubmitting || (currentStatus?.status === 'running')}
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
              >
                <option value="all">All Regions</option>
                {Object.entries(areas).map(([id, area]) => (
                  <option key={id} value={id}>{area.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label htmlFor="province" className="block text-sm font-medium text-gray-700 mb-1">Province</label>
              <select 
                id="province" 
                name="province" 
                className="w-full p-2 border border-gray-300 rounded-md"
                disabled={isSubmitting || (currentStatus?.status === 'running') || selectedRegion === "all"}
              >
                <option value="all">All Provinces</option>
                {selectedRegion !== "all" && Object.entries(areas[selectedRegion as keyof typeof areas]?.provinces || {}).map(([id, name]) => (
                  <option key={id} value={id}>{String(name)}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="refresh" 
                name="refresh" 
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                disabled={isSubmitting || (currentStatus?.status === 'running')}
              />
              <label htmlFor="refresh" className="ml-2 block text-sm text-gray-700">
                Refresh (clear existing pages)
              </label>
            </div>
          </div>
          
          <button 
            type="submit" 
            className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400"
            disabled={isSubmitting || (currentStatus?.status === 'running')}
          >
            {isSubmitting ? "Starting..." : "Start Retrieval"}
          </button>
          
          {currentStatus?.status === 'running' && (
            <p className="mt-2 text-sm text-red-600">Cannot start a new retrieval while one is already running</p>
          )}
        </Form>
      </div>
    </div>
  );
} 