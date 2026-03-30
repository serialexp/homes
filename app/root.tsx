import type { LoaderFunctionArgs } from "@remix-run/node";
  import { json } from "@remix-run/node";
  import {
    Links,
    Meta,
    Outlet,
    Scripts,
    isRouteErrorResponse,
    useLoaderData,
    useNavigation,
    useRouteError,
  } from "@remix-run/react";
  import { SignIn, SignOut } from "@phosphor-icons/react";
  import { getSession } from "./utils/auth.server.js";
  import "./style.css"

  export async function loader({ request }: LoaderFunctionArgs) {
    const session = await getSession(request);
    return json({ isAdmin: session.get("authenticated") === true });
  }

  export function ErrorBoundary() {
    const error = useRouteError();

    let title = "Unexpected Error";
    let message = "Something went wrong. Please try again later.";

    if (isRouteErrorResponse(error)) {
      title = `${error.status} ${error.statusText}`;
      if (error.status === 404) {
        message = "The page you were looking for could not be found.";
      } else if (error.status === 500) {
        message = "There was a server error. Please try again later.";
      } else {
        message = error.data?.message || `An error occurred (status ${error.status}).`;
      }
    } else if (error instanceof Error) {
      message = error.message;
    }

    return (
      <html lang="en" data-theme="light">
        <head>
          <link rel="icon" href="data:image/x-icon;base64,AA" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta charSet="utf-8" />
          <title>{title}</title>
          <Meta />
          <Links />
        </head>
        <body style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f5f5f5", color: "#333", margin: 0 }}>
          <header>
            <h1 style={{ color: "#2563eb", padding: "1rem", margin: 0, borderBottom: "1px solid #e5e7eb", backgroundColor: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
              Japan Property Explorer
            </h1>
          </header>
          <main style={{ maxWidth: "800px", margin: "4rem auto", textAlign: "center", padding: "2rem" }}>
            <h2 style={{ fontSize: "2rem", marginBottom: "1rem" }}>{title}</h2>
            <p style={{ fontSize: "1.1rem", color: "#666", marginBottom: "2rem" }}>{message}</p>
            <a
              href="/"
              style={{ color: "#2563eb", textDecoration: "underline", fontSize: "1rem" }}
            >
              Go back home
            </a>
          </main>
          <Scripts />
        </body>
      </html>
    );
  }

  export default function App() {
    const { isAdmin } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
    return (
      <html lang="en" data-theme="light">
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
              
              .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 1rem;
              }
            `}
          </style>
        </head>
        <body>
          {isLoading && (
            <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-blue-200">
              <div className="h-full bg-blue-600 animate-loading-bar" />
            </div>
          )}
          <header>
            <nav className="bg-white border-b border-gray-200 px-4 py-2">
              <div className="container mx-auto flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <a href="/">
                    <img src="/logo.png" alt="Japan Property Explorer" className="h-12 sm:h-14" />
                  </a>
                  {isAdmin && (
                    <>
                      <a href="/admin/retrieval" className="text-blue-600 hover:text-blue-800">Admin</a>
                      <a href="/admin/xpath-debug" className="text-blue-600 hover:text-blue-800">XPath Debug</a>
                    </>
                  )}
                </div>
                <div>
                  {isAdmin ? (
                    <form method="post" action="/admin/logout">
                      <button type="submit" className="text-gray-400 hover:text-gray-600" title="Logout">
                        <SignOut size={20} />
                      </button>
                    </form>
                  ) : (
                    <a href="/admin/login" className="text-gray-400 hover:text-gray-600" title="Login">
                      <SignIn size={20} />
                    </a>
                  )}
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
  