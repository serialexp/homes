import {
    Links,
    Meta,
    Outlet,
    Scripts,
  } from "@remix-run/react";
  import "./style.css"

  export default function App() {
    return (
      <html lang="en">
        <head>
          <link
            rel="icon"
            href="data:image/x-icon;base64,AA"
          />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="description" content="Japan Property Explorer" />
          <meta name="author" content="Japan Property Explorer" />
          <meta name="keywords" content="Japan, property, real estate, explorer, search, find, buy, sell, rent, apartment, house, land, commercial, investment" />
          <meta name="robots" content="index, follow" />
          <meta charSet="utf-8" />
          <Meta />
          <Links />
          <style>
            {`
              body {
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                background-color: #f5f5f5;
                color: #333;
                line-height: 1.5;
              }
              
              h1 {
                color: #2563eb;
                padding: 1rem;
                margin: 0;
                border-bottom: 1px solid #e5e7eb;
                background-color: white;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
              }
              
              .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 1rem;
              }
            `}
          </style>
        </head>
        <body>
          <header>
            <h1>Japan Property Explorer</h1>
            <nav className="bg-white border-b border-gray-200 px-4 py-2">
              <div className="container mx-auto flex items-center justify-between">
                <div className="flex space-x-4">
                  <a href="/" className="text-blue-600 hover:text-blue-800">Home</a>
                  <a href="/admin/retrieval" className="text-blue-600 hover:text-blue-800">Admin</a>
                  <a href="/admin/xpath-debug" className="text-blue-600 hover:text-blue-800">XPath Debug</a>
                </div>
              </div>
            </nav>
          </header>
          <main>
            <Outlet />
          </main>
  
          <Scripts />
        </body>
      </html>
    );
  }
  