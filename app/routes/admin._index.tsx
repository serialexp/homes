import { json } from "@remix-run/node";
import { Link } from "@remix-run/react";

export async function loader() {
  return json({});
}

export default function AdminIndex() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Property Data Retrieval Card */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Property Data Retrieval</h2>
          <p className="text-gray-600 mb-4">
            Retrieve property data from external sources and manage retrieval jobs.
          </p>
          <div className="flex flex-col space-y-2">
            <Link 
              to="/admin/retrieval" 
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 text-center"
            >
              Retrieval Dashboard
            </Link>
            <Link 
              to="/admin/retrieval/history" 
              className="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-md hover:bg-gray-300 text-center"
            >
              View Job History
            </Link>
          </div>
        </div>
        
        {/* XPath Debug Card */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">XPath Debugger</h2>
          <p className="text-gray-600 mb-4">
            Debug and test XPath expressions for web scraping.
          </p>
          <Link 
            to="/admin/xpath-debug" 
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 block text-center"
          >
            Open XPath Debugger
          </Link>
        </div>
        
        {/* Buildings & Rental Units Card */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Buildings & Rental Units</h2>
          <p className="text-gray-600 mb-4">
            Manage buildings and rental units in the database.
          </p>
          <Link 
            to="/admin/rentals" 
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 block text-center"
          >
            Manage Rentals
          </Link>
        </div>
      </div>
    </div>
  );
} 