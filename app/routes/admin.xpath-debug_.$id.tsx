import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { useEffect, useState } from "react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT, LABEL, PageHeader, PANEL } from "../components/AdminUi.js";
import * as xpath from "xpath";
import prisma from "../utils/db.server.js";
import { DOMParser } from "@xmldom/xmldom";
import { parseItems } from "../utils/parseUtils.js";
import { parseRentalBuildings, parseRentalUnitsForDB } from "../utils/rentalParseUtils.js";
import { generateDomTree, formatDomTree } from "../utils/domUtils.js";

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

// Quotes a value as an XPath string literal. Values holding both quote kinds
// are built with concat(), so user input cannot end the literal early.
function xpathStringLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  const quote = `'"'`;
  return `concat(${value.split('"').map((part) => `"${part}"`).join(`, ${quote}, `)})`;
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
      const allElements = xpath.select(`//*[contains(@class, ${xpathStringLiteral(className)})]`, document) as Element[];
      
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

const PRE = "m-0 overflow-auto rounded-field bg-neutral p-4 font-mono text-[13px] leading-relaxed text-neutral-content";

export default function XPathDebugDetailPage() {
  const { page, isRentalPage } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const submit = useSubmit();
  
  const [xpathQuery, setXpathQuery] = useState('');
  const [className, setClassName] = useState('');
  const [showHtml, setShowHtml] = useState(false);
  const [showDomTree, setShowDomTree] = useState(false);
  const [domTreeMaxDepth, setDomTreeMaxDepth] = useState(10);
  const [domTreeMaxChildren, setDomTreeMaxChildren] = useState(20);
  
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
  
  // Apply a common query. The query is submitted directly: the state update has not
  // reached the form's input yet, so submitting the form would run the previous query.
  const applyCommonQuery = (query: string) => {
    setXpathQuery(query);
    submit({ xpath: query }, { method: "post" });
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
  const classAnalysis = hasClassAnalysis ? (actionData as ClassAnalysisData) : null;

  return (
    <>
      <PageHeader
        title={`XPath debug: page #${page.id}`}
        actions={
          <Link to="/admin/xpath-debug" className={BUTTON_SECONDARY}>
            Back to cached pages
          </Link>
        }
      />

      {/* Page information and parsers */}
      <section aria-labelledby="page-h" className={`${PANEL} flex flex-col gap-4 p-5`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 id="page-h" className="m-0 text-lg font-semibold">Page information</h2>
          <span className="rounded-md bg-base-200 px-2 py-0.5 text-xs font-semibold text-base-content/80">{page.kind}</span>
          {isRentalPage && (
            <span className="text-sm font-medium text-success">✓ Rental property page (type=040)</span>
          )}
        </div>

        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-mono text-[13px] text-primary hover:underline"
        >
          {page.url}
        </a>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={showHtml}
            onClick={() => setShowHtml(!showHtml)}
            className={showHtml ? BUTTON_PRIMARY : BUTTON_SECONDARY}
          >
            {showHtml ? 'Hide HTML' : 'Show HTML'}
          </button>
          <button
            type="button"
            aria-pressed={showDomTree}
            onClick={() => setShowDomTree(!showDomTree)}
            className={showDomTree ? BUTTON_PRIMARY : BUTTON_SECONDARY}
          >
            {showDomTree ? 'Hide DOM tree' : 'Show DOM tree'}
          </button>
        </div>

        {/* DOM Tree Settings */}
        {showDomTree && (
          <div className="flex flex-col gap-4 rounded-field bg-base-200/60 p-4">
            <h3 className={`m-0 ${LABEL}`}>DOM tree settings</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="maxDepth" className={LABEL}>Max depth</label>
                <input
                  type="number"
                  id="maxDepth"
                  value={domTreeMaxDepth}
                  onChange={(e) => setDomTreeMaxDepth(parseInt(e.target.value) || 10)}
                  className={INPUT}
                  min="1"
                  max="50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="maxChildren" className={LABEL}>Max children per node</label>
                <input
                  type="number"
                  id="maxChildren"
                  value={domTreeMaxChildren}
                  onChange={(e) => setDomTreeMaxChildren(parseInt(e.target.value) || 20)}
                  className={INPUT}
                  min="1"
                  max="100"
                />
              </div>
            </div>
            <div>
              <button type="button" onClick={regenerateDomTree} className={BUTTON_SECONDARY}>
                Regenerate DOM tree
              </button>
            </div>
          </div>
        )}

        {/* Parse Items */}
        <div className="flex flex-col gap-2 border-t border-base-300 pt-4">
          <h3 className={`m-0 ${LABEL}`}>Parse items</h3>
          <div className="flex flex-wrap gap-2">
            <Form method="post">
              <input type="hidden" name="_action" value="parse" />
              <button type="submit" className={BUTTON_PRIMARY} disabled={isSubmitting}>
                {isSubmitting ? "Parsing..." : "Parse property items"}
              </button>
            </Form>

            <Form method="post">
              <input type="hidden" name="_action" value="parse_rental" />
              <button
                type="submit"
                className={isRentalPage ? BUTTON_PRIMARY : BUTTON_SECONDARY}
                disabled={isSubmitting}
                title={isRentalPage ? "This is a rental page" : "This may not be a rental page"}
              >
                {isSubmitting ? "Parsing..." : "Parse rental items"}
              </button>
            </Form>
          </div>
          {!isRentalPage && (
            <p className="m-0 text-sm text-base-content/70">
              Note: This doesn't appear to be a rental page, but you can still try parsing rental items.
            </p>
          )}
        </div>
      </section>

      {/* XPath query and class analysis */}
      <section aria-labelledby="query-h" className={`${PANEL} flex flex-col gap-5 p-5`}>
        <h2 id="query-h" className="m-0 text-lg font-semibold">XPath query</h2>

        <Form method="post" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="xpath" className={LABEL}>XPath expression</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                id="xpath"
                name="xpath"
                value={xpathQuery}
                onChange={(e) => setXpathQuery(e.target.value)}
                className={`${INPUT} flex-1 font-mono text-[13px]`}
                placeholder="Enter XPath query (e.g., //div[@class='example'])"
              />
              <button type="submit" className={BUTTON_PRIMARY} disabled={isSubmitting}>
                {isSubmitting ? "Executing..." : "Execute query"}
              </button>
            </div>
          </div>
        </Form>

        <div className="flex flex-col gap-2">
          <span className={LABEL}>Common queries</span>
          <div className="flex flex-wrap gap-1.5">
            {commonQueries.map((query) => (
              <button
                key={query}
                type="button"
                title={query}
                onClick={() => applyCommonQuery(query)}
                className="min-h-11 rounded-md border border-base-300 bg-base-200/60 px-2.5 font-mono text-xs text-base-content/80 hover:bg-base-200"
              >
                {query.length > 44 ? `${query.slice(0, 44)}…` : query}
              </button>
            ))}
          </div>
        </div>

        <Form method="post" className="flex flex-col gap-3 border-t border-base-300 pt-5">
          <input type="hidden" name="_action" value="analyze_class" />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="className" className={LABEL}>Class analysis</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                id="className"
                name="className"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                className={`${INPUT} flex-1 font-mono text-[13px]`}
                placeholder="Enter class name (e.g., property_unit-content)"
              />
              <button type="submit" className={BUTTON_SECONDARY} disabled={isSubmitting}>
                {isSubmitting ? "Analyzing..." : "Analyze class usage"}
              </button>
            </div>
          </div>
        </Form>
      </section>

      {/* Class Analysis Results */}
      {classAnalysis && (
        <section aria-labelledby="analysis-h" className={`${PANEL} flex flex-col gap-5 p-5`}>
          <h2 id="analysis-h" className="m-0 text-lg font-semibold">
            Class analysis: "{classAnalysis.className}"
          </h2>

          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))] gap-3">
            <div className="flex flex-col gap-1 rounded-field border border-base-300 p-4">
              <dt className="text-sm text-base-content/70">Total elements</dt>
              <dd className="m-0 font-display text-2xl font-bold tabular-nums">{classAnalysis.analysis.totalElements}</dd>
            </div>
            <div className="flex flex-col gap-1 rounded-field border border-base-300 p-4">
              <dt className="text-sm text-base-content/70">Exact class matches</dt>
              <dd className="m-0 font-display text-2xl font-bold tabular-nums">{classAnalysis.analysis.exactMatches}</dd>
            </div>
            <div className="flex flex-col gap-1 rounded-field border border-base-300 p-4">
              <dt className="text-sm text-base-content/70">Contains class matches</dt>
              <dd className="m-0 font-display text-2xl font-bold tabular-nums">{classAnalysis.analysis.containsMatches}</dd>
            </div>
            <div className="flex flex-col gap-1 rounded-field border border-base-300 p-4">
              <dt className="text-sm text-base-content/70">Elements with multiple classes</dt>
              <dd className="m-0 font-display text-2xl font-bold tabular-nums">{classAnalysis.analysis.multipleClassElements}</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <h3 className={`m-0 ${LABEL}`}>Element types</h3>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm">
              {Object.entries(classAnalysis.analysis.elementTypes).map(([type, count]) => (
                <li key={type} className="rounded-field bg-base-200 px-3 py-1.5">
                  <span className="font-semibold">{type}</span> <span className="tabular-nums">{count}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className={`m-0 ${LABEL}`}>Class details</h3>
            <div className="max-h-[60vh] overflow-auto rounded-field border border-base-300">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead className="sticky top-0 bg-base-200">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.05em] text-base-content/70">
                    <th scope="col" className="px-4 py-2.5">Element</th>
                    <th scope="col" className="px-4 py-2.5">Full class attribute</th>
                    <th scope="col" className="px-4 py-2.5">Classes</th>
                  </tr>
                </thead>
                <tbody>
                  {classAnalysis.analysis.classDetails.map((detail, index) => (
                    <tr key={index} className="border-t border-base-300/60 align-top">
                      <td className="px-4 py-2 font-mono">{detail.nodeName}</td>
                      <td className="px-4 py-2 font-mono break-all">{detail.fullClassName}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {detail.classes.map((cls, i) => (
                            <span
                              key={i}
                              className={`rounded-md px-2 py-0.5 text-xs ${
                                cls === classAnalysis.className
                                  ? 'bg-success/15 font-semibold text-success'
                                  : 'bg-base-200 text-base-content/80'
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
        </section>
      )}

      {/* DOM Tree View */}
      {showDomTree && (
        <section aria-labelledby="tree-h" className={`${PANEL} flex flex-col gap-4 p-5`}>
          <h2 id="tree-h" className="m-0 text-lg font-semibold">DOM tree</h2>
          <pre className={`${PRE} max-h-[80vh] whitespace-pre text-xs`}>{domTreeText}</pre>
        </section>
      )}

      {/* HTML Content */}
      {showHtml && (
        <section aria-labelledby="html-h" className={`${PANEL} flex flex-col gap-4 p-5`}>
          <h2 id="html-h" className="m-0 text-lg font-semibold">HTML content</h2>
          <pre className={`${PRE} max-h-[80vh] whitespace-pre-wrap break-all text-xs`}>{page.content}</pre>
        </section>
      )}

      {/* Rental Parse Results */}
      {hasRentalParseResults && (
        <section aria-labelledby="rental-h" className={`${PANEL} flex flex-col gap-4 p-5`}>
          <h2 id="rental-h" className="m-0 text-lg font-semibold">Rental parse results</h2>
          <div className="flex flex-col gap-1 text-sm">
            <p className="m-0"><span className="font-medium">Buildings found:</span> {(actionData as RentalParseSuccessData).parseResults.buildings.length}</p>
            <p className="m-0"><span className="font-medium">Total rental units:</span> {(actionData as RentalParseSuccessData).parseResults.rentalUnits.length}</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <h3 className={`m-0 ${LABEL}`}>Buildings</h3>
              <pre className={`${PRE} max-h-[60vh] whitespace-pre text-xs`}>{formatJson((actionData as RentalParseSuccessData).parseResults.buildings)}</pre>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <h3 className={`m-0 ${LABEL}`}>Rental units (DB format)</h3>
              <pre className={`${PRE} max-h-[60vh] whitespace-pre text-xs`}>{formatJson((actionData as RentalParseSuccessData).parseResults.rentalUnits)}</pre>
            </div>
          </div>
        </section>
      )}

      {/* Parse Results (non-rental) */}
      {hasParseResults && !hasRentalParseResults && (
        <section aria-labelledby="parse-h" className={`${PANEL} flex flex-col gap-4 p-5`}>
          <h2 id="parse-h" className="m-0 text-lg font-semibold">Parse results</h2>
          <p className="m-0 text-sm"><span className="font-medium">Items found:</span> {(actionData as ParseSuccessData).parseResults.length}</p>
          <pre className={`${PRE} max-h-[80vh] whitespace-pre text-xs`}>{formatJson((actionData as ParseSuccessData).parseResults)}</pre>
        </section>
      )}

      {/* Query Results */}
      {actionData && !hasParseResults && !hasClassAnalysis && (
        <section aria-labelledby="query-results-h" className={`${PANEL} flex flex-col gap-4 p-5`}>
          <h2 id="query-results-h" className="m-0 text-lg font-semibold">Query results</h2>

          {hasError ? (
            <div role="alert" className="rounded-field bg-error/10 p-4 text-error">
              <p className="m-0 font-medium">Error:</p>
              <p className="m-0 break-words">{(actionData as ErrorActionData).error}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1 text-sm">
                <p className="m-0"><span className="font-medium">Query:</span> <span className="break-all font-mono text-[13px]">{(actionData as SuccessActionData).query}</span></p>
                <p className="m-0"><span className="font-medium">Matched nodes:</span> <span className="tabular-nums">{(actionData as SuccessActionData).count}</span></p>
              </div>
              <pre className={`${PRE} max-h-[80vh] whitespace-pre text-xs`}>{formatJson((actionData as SuccessActionData).results)}</pre>
            </>
          )}
        </section>
      )}
    </>
  );
}
