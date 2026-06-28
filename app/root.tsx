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
  import { VERSION } from "./utils/version.server.js";
  import "./style.css"

  export async function loader({ request }: LoaderFunctionArgs) {
    const session = await getSession(request);
    return json({
      isAdmin: session.get("authenticated") === true,
      version: VERSION,
    });
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
      <html lang="en">
        <head>
          <link rel="icon" href="data:image/x-icon;base64,AA" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta charSet="utf-8" />
          <title>{title}</title>
          <Meta />
          <Links />
        </head>
        <body className="bg-base-200 text-base-content font-sans m-0">
          <header>
            <h1 className="text-blue-600 p-4 m-0 border-b border-base-300 bg-base-100 shadow">
              Japan Property Explorer
            </h1>
          </header>
          <main className="max-w-[800px] mx-auto mt-16 text-center p-8">
            <h2 className="text-3xl mb-4">{title}</h2>
            <p className="text-lg text-base-content/60 mb-8">{message}</p>
            <a
              href="/"
              className="text-blue-600 underline text-base"
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
    const { isAdmin, version } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isLoading = navigation.state === "loading";
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
              .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 1rem;
              }
            `}
          </style>
        </head>
        <body className="bg-base-200 text-base-content font-sans leading-relaxed">
          {isLoading && (
            <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-blue-200">
              <div className="h-full bg-blue-600 animate-loading-bar" />
            </div>
          )}
          <header>
            <nav className="bg-base-100 border-b border-base-300 px-4 py-2">
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
                      <button type="submit" className="text-base-content/40 hover:text-base-content/60" title="Logout">
                        <SignOut size={20} />
                      </button>
                    </form>
                  ) : (
                    <a href="/admin/login" className="text-base-content/40 hover:text-base-content/60" title="Login">
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

          <footer className="mt-16 border-t border-base-300 px-4 py-3 text-center text-xs text-base-content/40">
            {version.commitUrl ? (
              <a
                href={version.commitUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-base-content/60"
                title={version.buildTime ? `Built ${version.buildTime}` : undefined}
              >
                version {version.sha}
              </a>
            ) : (
              <span title={version.buildTime ? `Built ${version.buildTime}` : undefined}>
                version {version.sha}
              </span>
            )}
          </footer>

          <Scripts />
        </body>
      </html>
    );
  }
  