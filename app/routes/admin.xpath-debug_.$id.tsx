import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { PrismaClient } from "@prisma/client";
import * as xpath from "xpath";
import { DOMParser } from "@xmldom/xmldom";
import { parseItems } from "../utils/parseUtils.js";
import { parseRentalBuildings, parseRentalUnitsForDB } from "../utils/rentalParseUtils.js";
import { generateDomTree, formatDomTree } from "../utils/domUtils.js";

const prisma = new PrismaClient();

export async function loader({ params }: LoaderFunctionArgs) {
  const id = parseInt(params.id || "0", 10);
  
  if (isNaN(id) || id <= 0) {
    throw new Response("Invalid page ID", { status: 400 });
  }
  
  const page = await prisma.page.findUnique({
    where: { id },
  });
  
  if (!page) {
    throw new Response("Page not found", { status: 404 });
  }
  
  // Determine if this is a rental page based on URL
  const isRentalPage = isRentalPageUrl(page.url);
  
  return json({ page, isRentalPage });
}

// Function to determine if a URL is for a rental page
function isRentalPageUrl(url: string): boolean {
  try {
    // Check if the URL contains the rental path or type=040 parameter
    return url.includes('/jj/chintai/ichiran/') || 
           url.includes('bs=040') || 
           url.includes('bs=040&');
  } catch (error) {
    return false;
  }
}

type SuccessActionData = {
  success: true;
  query: string;
  count: number;
  results: any[];
};

type ErrorActionData = {
  success?: false;
  error: string;
};

type ParseSuccessData = {
  success: true;
  parseResults: any[];
};

type ClassAnalysisData = {
  success: true;
  className: string;
  analysis: {
    totalElements: number;
    elementTypes: Record<string, number>;
    exactMatches: number;
    containsMatches: number;
    multipleClassElements: number;
    classDetails: Array<{
      nodeName: string;
      fullClassName: string;
      classes: string[];
    }>;
  };
};

type RentalParseSuccessData = {
  success: true;
  parseResults: {
    buildings: any[];
    rentalUnits: any[];
  };
  isRental: true;
};

type ActionData = SuccessActionData | ErrorActionData | ParseSuccessData | ClassAnalysisData | RentalParseSuccessData;

export async function action({ request, params }: ActionFunctionArgs) {
  const id = parseInt(params.id || "0", 10);
  
  if (isNaN(id) || id <= 0) {
    return json<ErrorActionData>({ error: "Invalid page ID" }, { status: 400 });
  }
  
  const formData = await request.formData();
  const action = formData.get("_action") as string;
  
  // Get the page content
  const page = await prisma.page.findUnique({
    where: { id },
  });
  
  if (!page) {
    return json<ErrorActionData>({ error: "Page not found" }, { status: 404 });
  }
  
  // Parse the HTML content
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {},
      fatalError: () => {},
    },
  });
  
  const document = parser.parseFromString(page.content, "text/html");
  
  // Handle class analysis action
  if (action === "analyze_class") {
    try {
      const className = formData.get("className") as string;
      
      if (!className) {
        return json<ErrorActionData>({ error: "Class name is required" }, { status: 400 });
      }
      
      // Find all elements with this class (using contains)
      const allElements = xpath.select(`//*[contains(@class, "${className}")]`, document) as Element[];
      
      // Count element types
      const elementTypes: Record<string, number> = {};
      let exactMatches = 0;
      let containsMatches = 0;
      let multipleClassElements = 0;
      
      // Detailed class information
      const classDetails = allElements.map((element: Element) => {
        // Count element types
        const nodeName = element.nodeName.toLowerCase();
        elementTypes[nodeName] = (elementTypes[nodeName] || 0) + 1;
        
        // Get full class attribute
        const fullClassName = element.getAttribute("class") || "";
        const classes = fullClassName.split(/\s+/).filter(Boolean);
        
        // Count exact vs contains matches
        if (fullClassName === className) {
          exactMatches++;
        } else {
          containsMatches++;
        }
        
        // Count elements with multiple classes
        if (classes.length > 1) {
          multipleClassElements++;
        }
        
        return {
          nodeName,
          fullClassName,
          classes
        };
      });
      
      return json<ClassAnalysisData>({
        success: true,
        className,
        analysis: {
          totalElements: allElements.length,
          elementTypes,
          exactMatches,
          containsMatches,
          multipleClassElements,
          classDetails
        }
      });
    } catch (error) {
      return json<ErrorActionData>({
        error: error instanceof Error ? error.message : "An error occurred while analyzing class"
      }, { status: 400 });
    }
  }
  
  // Handle parse action for regular property items
  if (action === "parse") {
    try {
      // Run the parseItems function
      const results = parseItems(document);
      
      return json<ParseSuccessData>({
        success: true,
        parseResults: results
      });
    } catch (error) {
      return json<ErrorActionData>({
        error: error instanceof Error ? error.message : "An error occurred while parsing items"
      }, { status: 400 });
    }
  }
  
  // Handle parse action for rental items
  if (action === "parse_rental") {
    try {
      // Run the parseRentalBuildings function
      const buildings = parseRentalBuildings(document);
      const rentalUnits = parseRentalUnitsForDB(document, "000", "00"); // Using placeholder region/province
      
      return json<RentalParseSuccessData>({
        success: true,
        parseResults: {
          buildings,
          rentalUnits
        },
        isRental: true
      });
    } catch (error) {
      return json<ErrorActionData>({
        error: error instanceof Error ? error.message : "An error occurred while parsing rental items"
      }, { status: 400 });
    }
  }
  
  // Handle XPath query action
  const xpathQuery = formData.get("xpath") as string;
  
  if (!xpathQuery) {
    return json<ErrorActionData>({ error: "XPath query is required" }, { status: 400 });
  }
  
  try {
    // Execute the XPath query
    const nodes = xpath.select(xpathQuery, document);
    
    // Format the results
    let results: any[] = [];
    
    if (Array.isArray(nodes)) {
      results = nodes.map((node: any) => {
        if (node.nodeType === 1) { // Element node
          return {
            type: 'element',
            nodeName: node.nodeName,
            attributes: getAttributes(node),
            textContent: node.textContent,
            outerHTML: getOuterHTML(node),
          };
        } else if (node.nodeType === 3) { // Text node
          return {
            type: 'text',
            textContent: node.nodeValue,
          };
        } else if (node.nodeType === 2) { // Attribute node
          return {
            type: 'attribute',
            name: node.nodeName,
            value: node.nodeValue,
          };
        } else {
          return {
            type: 'other',
            nodeType: node.nodeType,
            value: String(node),
          };
        }
      });
    } else {
      // Handle non-array results (like numbers or booleans)
      results = [{ type: 'value', value: String(nodes) }];
    }
    
    return json<SuccessActionData>({ 
      success: true, 
      query: xpathQuery,
      count: Array.isArray(nodes) ? nodes.length : 1,
      results 
    });
  } catch (error) {
    return json<ErrorActionData>({ 
      error: error instanceof Error ? error.message : "An error occurred while executing the XPath query" 
    }, { status: 400 });
  }
}

// Helper function to get attributes of an element
function getAttributes(element: any) {
  const attributes: Record<string, string> = {};
  
  if (element.attributes) {
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      attributes[attr.nodeName] = attr.nodeValue;
    }
  }
  
  return attributes;
}

// Helper function to get the outer HTML of an element
function getOuterHTML(element: any) {
  try {
    // Simple implementation to get the outer HTML
    let html = `<${element.nodeName}`;
    
    // Add attributes
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        html += ` ${attr.nodeName}="${attr.nodeValue}"`;
      }
    }
    
    html += '>';
    
    // Add inner content (simplified)
    if (element.textContent) {
      html += element.textContent;
    }
    
    html += `</${element.nodeName}>`;
    
    return html;
  } catch (error) {
    return '[Error getting HTML]';
  }
}

export default function XPathDebugDetailPage() {
  const { page, isRentalPage } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const [xpathQuery, setXpathQuery] = useState('');
  const [className, setClassName] = useState('');
  const [showHtml, setShowHtml] = useState(false);
  const [showDomTree, setShowDomTree] = useState(false);
  const [domTreeMaxDepth, setDomTreeMaxDepth] = useState(10);
  const [domTreeMaxChildren, setDomTreeMaxChildren] = useState(20);
  const formRef = useRef<HTMLFormElement>(null);
  const parseFormRef = useRef<HTMLFormElement>(null);
  const parseRentalFormRef = useRef<HTMLFormElement>(null);
  const classAnalysisFormRef = useRef<HTMLFormElement>(null);
  
  // Generate DOM tree
  const [domTreeText, setDomTreeText] = useState<string>('');
  
  useEffect(() => {
    if (showDomTree && !domTreeText) {
      try {
        // Parse the HTML content
        const parser = new DOMParser({
          errorHandler: {
            warning: () => {},
            error: () => {},
            fatalError: () => {},
          },
        });
        
        const document = parser.parseFromString(page.content, "text/html");
        const tree = generateDomTree(document, 0, domTreeMaxDepth, domTreeMaxChildren);
        const formattedTree = formatDomTree(tree);
        setDomTreeText(formattedTree);
      } catch (error) {
        console.error('Error generating DOM tree:', error);
        setDomTreeText('Error generating DOM tree');
      }
    }
  }, [showDomTree, page.content, domTreeMaxDepth, domTreeMaxChildren, domTreeText]);
  
  // Regenerate DOM tree when settings change
  const regenerateDomTree = () => {
    setDomTreeText('');
    setShowDomTree(true);
  };
  
  // Set common XPath queries
  const commonQueries = [
    '//div[contains(@class, "property_unit-content")]',
    '//*[@class="property_unit-content"]',
    '//div[@class="property_unit-content"]',
    '//div[contains(@class, "property_unit-content")][1]//a[@class="property_unit-link_title"]/@href',
    '//div[contains(@class, "property_unit-content")][1]//span[contains(@class, "property_unit-price")]',
  ];
  
  // Apply a common query
  const applyCommonQuery = (query: string) => {
    setXpathQuery(query);
    if (formRef.current) {
      formRef.current.submit();
    }
  };
  
  // Format JSON for display
  const formatJson = (obj: any) => {
    return JSON.stringify(obj, null, 2);
  };
  
  // Check if action data has an error
  const hasError = actionData && 'error' in actionData;
  
  // Check if action data has parse results
  const hasParseResults = actionData && 'parseResults' in actionData;
  
  // Check if action data has rental parse results
  const hasRentalParseResults = actionData && 'parseResults' in actionData && 'isRental' in actionData;
  
  // Check if action data has class analysis results
  const hasClassAnalysis = actionData && 'className' in actionData && 'analysis' in actionData;
  
  return (
    <div className="w-full p-4">
      <div className="mb-4">
        <Link to="/admin/xpath-debug" className="text-blue-600 hover:text-blue-800">
          &larr; Back to Pages List
        </Link>
      </div>
      
      <h2 className="text-2xl font-bold mb-6">XPath Debug: Page #{page.id}</h2>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Page Info */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">Page Information</h3>
          
          <div className="mb-4">
            <p><span className="font-medium">ID:</span> {page.id}</p>
            <p><span className="font-medium">Kind:</span> {page.kind}</p>
            <p>
              <span className="font-medium">URL:</span> 
              <a 
                href={page.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 break-all"
              >
                {page.url}
              </a>
            </p>
            {isRentalPage && (
              <p className="mt-2 text-green-600 font-medium">
                ✓ This is a rental property page (type=040)
              </p>
            )}
          </div>
          
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowHtml(!showHtml)}
              className={`px-4 py-2 ${showHtml ? 'bg-blue-600 text-white' : 'bg-gray-200'} rounded hover:bg-blue-700 hover:text-white`}
            >
              {showHtml ? 'Hide HTML' : 'Show HTML'}
            </button>
            
            <button
              type="button"
              onClick={() => setShowDomTree(!showDomTree)}
              className={`px-4 py-2 ${showDomTree ? 'bg-blue-600 text-white' : 'bg-gray-200'} rounded hover:bg-blue-700 hover:text-white`}
            >
              {showDomTree ? 'Hide DOM Tree' : 'Show DOM Tree'}
            </button>
          </div>
          
          {/* DOM Tree Settings */}
          {showDomTree && (
            <div className="mb-4 p-4 bg-gray-50 rounded">
              <h4 className="font-medium mb-2">DOM Tree Settings:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="maxDepth" className="block text-sm font-medium text-gray-700 mb-1">
                    Max Depth:
                  </label>
                  <input
                    type="number"
                    id="maxDepth"
                    value={domTreeMaxDepth}
                    onChange={(e) => setDomTreeMaxDepth(parseInt(e.target.value) || 10)}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    min="1"
                    max="50"
                  />
                </div>
                <div>
                  <label htmlFor="maxChildren" className="block text-sm font-medium text-gray-700 mb-1">
                    Max Children per Node:
                  </label>
                  <input
                    type="number"
                    id="maxChildren"
                    value={domTreeMaxChildren}
                    onChange={(e) => setDomTreeMaxChildren(parseInt(e.target.value) || 20)}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    min="1"
                    max="100"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={regenerateDomTree}
                className="mt-2 px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700"
              >
                Regenerate DOM Tree
              </button>
            </div>
          )}
          
          {/* Parse Items Buttons */}
          <div className="mt-6">
            <h4 className="font-medium mb-2">Parse Items:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Form method="post" ref={parseFormRef}>
                <input type="hidden" name="_action" value="parse" />
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-green-600 text-white font-medium rounded-md hover:bg-green-700 disabled:bg-gray-400"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Parsing..." : "Parse Property Items"}
                </button>
              </Form>
              
              <Form method="post" ref={parseRentalFormRef}>
                <input type="hidden" name="_action" value="parse_rental" />
                <button
                  type="submit"
                  className={`w-full px-4 py-2 ${isRentalPage ? 'bg-blue-600' : 'bg-gray-600'} text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400`}
                  disabled={isSubmitting}
                  title={isRentalPage ? "This is a rental page" : "This may not be a rental page"}
                >
                  {isSubmitting ? "Parsing..." : "Parse Rental Items"}
                </button>
              </Form>
            </div>
            {!isRentalPage && (
              <p className="mt-2 text-sm text-gray-600">
                Note: This doesn't appear to be a rental page, but you can still try parsing rental items.
              </p>
            )}
          </div>
        </div>
        
        {/* XPath Query Form */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">XPath Query</h3>
          
          <Form method="post" ref={formRef}>
            <div className="mb-4">
              <label htmlFor="xpath" className="block text-sm font-medium text-gray-700 mb-1">
                XPath Expression:
              </label>
              <input
                type="text"
                id="xpath"
                name="xpath"
                value={xpathQuery}
                onChange={(e) => setXpathQuery(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="Enter XPath query (e.g., //div[@class='example'])"
              />
            </div>
            
            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Executing..." : "Execute Query"}
            </button>
          </Form>
          
          <div className="mt-4">
            <h4 className="font-medium mb-2">Common Queries:</h4>
            <div className="flex flex-wrap gap-2">
              {commonQueries.map((query, index) => (
                <button
                  key={index}
                  onClick={() => applyCommonQuery(query)}
                  className="px-2 py-1 bg-gray-200 text-sm rounded hover:bg-gray-300"
                >
                  {query.length > 30 ? query.substring(0, 30) + '...' : query}
                </button>
              ))}
            </div>
          </div>
          
          {/* Class Analysis Form */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="font-medium mb-2">Class Analysis:</h4>
            <Form method="post" ref={classAnalysisFormRef}>
              <input type="hidden" name="_action" value="analyze_class" />
              <div className="mb-4">
                <label htmlFor="className" className="block text-sm font-medium text-gray-700 mb-1">
                  Class Name:
                </label>
                <input
                  type="text"
                  id="className"
                  name="className"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  placeholder="Enter class name (e.g., property_unit-content)"
                />
              </div>
              
              <button
                type="submit"
                className="w-full px-4 py-2 bg-purple-600 text-white font-medium rounded-md hover:bg-purple-700 disabled:bg-gray-400"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Analyzing..." : "Analyze Class Usage"}
              </button>
            </Form>
          </div>
        </div>
      </div>
      
      {/* Class Analysis Results */}
      {hasClassAnalysis && (
        <div className="mb-6 bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">
            Class Analysis: "{(actionData as ClassAnalysisData).className}"
          </h3>
          
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded">
              <p className="text-lg font-bold text-blue-800">
                {(actionData as ClassAnalysisData).analysis.totalElements}
              </p>
              <p className="text-sm text-blue-600">Total Elements</p>
            </div>
            
            <div className="bg-green-50 p-4 rounded">
              <p className="text-lg font-bold text-green-800">
                {(actionData as ClassAnalysisData).analysis.exactMatches}
              </p>
              <p className="text-sm text-green-600">Exact Class Matches</p>
            </div>
            
            <div className="bg-yellow-50 p-4 rounded">
              <p className="text-lg font-bold text-yellow-800">
                {(actionData as ClassAnalysisData).analysis.containsMatches}
              </p>
              <p className="text-sm text-yellow-600">Contains Class Matches</p>
            </div>
            
            <div className="bg-purple-50 p-4 rounded">
              <p className="text-lg font-bold text-purple-800">
                {(actionData as ClassAnalysisData).analysis.multipleClassElements}
              </p>
              <p className="text-sm text-purple-600">Elements with Multiple Classes</p>
            </div>
          </div>
          
          <div className="mb-4">
            <h4 className="font-medium mb-2">Element Types:</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries((actionData as ClassAnalysisData).analysis.elementTypes).map(([type, count]) => (
                <div key={type} className="px-3 py-1 bg-gray-100 rounded">
                  <span className="font-medium">{type}:</span> {count}
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Class Details:</h4>
            <div className="bg-gray-100 p-4 rounded overflow-auto" style={{ maxHeight: '60vh' }}>
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="py-2 px-4 text-left">Element</th>
                    <th className="py-2 px-4 text-left">Full Class Attribute</th>
                    <th className="py-2 px-4 text-left">Classes</th>
                  </tr>
                </thead>
                <tbody>
                  {(actionData as ClassAnalysisData).analysis.classDetails.map((detail, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="py-2 px-4 font-mono">{detail.nodeName}</td>
                      <td className="py-2 px-4 font-mono">{detail.fullClassName}</td>
                      <td className="py-2 px-4">
                        <div className="flex flex-wrap gap-1">
                          {detail.classes.map((cls, i) => (
                            <span 
                              key={i} 
                              className={`px-2 py-1 text-xs rounded ${
                                cls === (actionData as ClassAnalysisData).className 
                                  ? 'bg-green-200 text-green-800' 
                                  : 'bg-gray-200'
                              }`}
                            >
                              {cls}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      
      {/* DOM Tree View */}
      {showDomTree && (
        <div className="mb-6 bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">DOM Tree</h3>
          
          <div className="bg-gray-100 p-4 rounded overflow-auto" style={{ maxHeight: '80vh' }}>
            <pre className="text-xs font-mono whitespace-pre">{domTreeText}</pre>
          </div>
        </div>
      )}
      
      {/* HTML Content */}
      {showHtml && (
        <div className="mb-6 bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">HTML Content</h3>
          
          <div className="bg-gray-100 p-4 rounded overflow-auto" style={{ maxHeight: '80vh' }}>
            <pre className="text-xs whitespace-pre-wrap break-all">{page.content}</pre>
          </div>
        </div>
      )}
      
      {/* Rental Parse Results */}
      {hasRentalParseResults && (
        <div className="mb-6 bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">Rental Parse Results</h3>
          
          <div>
            <div className="mb-4">
              <p><span className="font-medium">Buildings Found:</span> {(actionData as RentalParseSuccessData).parseResults.buildings.length}</p>
              <p><span className="font-medium">Total Rental Units:</span> {(actionData as RentalParseSuccessData).parseResults.rentalUnits.length}</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-2">Buildings:</h4>
                <div className="bg-gray-100 p-4 rounded overflow-auto" style={{ maxHeight: '60vh' }}>
                  <pre className="text-xs">{formatJson((actionData as RentalParseSuccessData).parseResults.buildings)}</pre>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Rental Units (DB Format):</h4>
                <div className="bg-gray-100 p-4 rounded overflow-auto" style={{ maxHeight: '60vh' }}>
                  <pre className="text-xs">{formatJson((actionData as RentalParseSuccessData).parseResults.rentalUnits)}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Parse Results (non-rental) */}
      {hasParseResults && !hasRentalParseResults && (
        <div className="mb-6 bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">Parse Results</h3>
          
          <div>
            <div className="mb-4">
              <p><span className="font-medium">Items Found:</span> {(actionData as ParseSuccessData).parseResults.length}</p>
            </div>
            
            <div className="bg-gray-100 p-4 rounded overflow-auto" style={{ maxHeight: '80vh' }}>
              <pre className="text-xs">{formatJson((actionData as ParseSuccessData).parseResults)}</pre>
            </div>
          </div>
        </div>
      )}
      
      {/* Query Results */}
      {actionData && !hasParseResults && !hasClassAnalysis && (
        <div className="mb-6 bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">Query Results</h3>
          
          {hasError ? (
            <div className="p-4 bg-red-100 text-red-800 rounded-lg">
              <p className="font-medium">Error:</p>
              <p>{(actionData as ErrorActionData).error}</p>
            </div>
          ) : (
            <div>
              <div className="mb-4">
                <p><span className="font-medium">Query:</span> {(actionData as SuccessActionData).query}</p>
                <p><span className="font-medium">Matched Nodes:</span> {(actionData as SuccessActionData).count}</p>
              </div>
              
              <div className="bg-gray-100 p-4 rounded overflow-auto" style={{ maxHeight: '80vh' }}>
                <pre className="text-xs">{formatJson((actionData as SuccessActionData).results)}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 