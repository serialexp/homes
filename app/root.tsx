import type { LoaderFunctionArgs } from "@remix-run/node";
  import { json } from "@remix-run/node";
  import {
    Links,
    Meta,
    Outlet,
    Scripts,
    isRouteErrorResponse,
    Link,
    useLoaderData,
    useLocation,
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
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
          <title>{title}</title>
          <Meta />
          <Links />
        </head>
        <body className="bg-base-200 text-base-content font-sans m-0">
          <header>
            <h1 className="text-primary p-4 m-0 border-b border-base-300 bg-base-100 shadow">
              Japan Property Explorer
            </h1>
          </header>
          <main className="max-w-[800px] mx-auto mt-16 text-center p-8">
            <h2 className="text-3xl mb-4">{title}</h2>
            <p className="text-lg text-base-content/60 mb-8">{message}</p>
            <a
              href="/"
              className="text-primary underline text-base"
            >
              Go back home
            </a>
          </main>
          <Scripts />
        </body>
      </html>
    );
  }

  // Which top-level section a path belongs to, for the header's active link.
function sectionOf(pathname: string): "rent" | "buy" | null {
  if (pathname.startsWith("/rental")) return "rent";
  if (pathname === "/" || pathname.startsWith("/areas") || pathname.startsWith("/properties")) return "buy";
  return null;
}

function navLinkClass(active: boolean): string {
  return `rounded-lg px-3.5 py-2.5 font-medium text-base-content no-underline hover:bg-base-200 ${active ? "bg-base-300/60 font-semibold" : ""}`;
}

export default function App() {
    const { isAdmin, version } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const location = useLocation();
    const section = sectionOf(location.pathname);
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
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
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
            <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-primary/20">
              <div className="h-full bg-primary animate-loading-bar" />
            </div>
          )}          <header className="border-b border-base-300 bg-base-100">
            <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
              <Link to="/" className="flex items-center gap-2.5 text-base-content no-underline">
                <span aria-hidden="true" className="size-[22px] shrink-0 rounded-full bg-accent" />
                <span className="font-display text-[19px] font-bold tracking-[-0.01em]">Japan Property Explorer</span>
              </Link>
              <nav aria-label="Main" className="flex items-center gap-1">
                <Link
                  to="/rental/areas/040"
                  aria-current={section === "rent" ? "page" : undefined}
                  className={navLinkClass(section === "rent")}
                >
                  Rent
                </Link>
                <Link
                  to="/"
                  aria-current={section === "buy" ? "page" : undefined}
                  className={navLinkClass(section === "buy")}
                >
                  Buy
                </Link>
                {isAdmin && (
                  <>
                    <Link to="/admin/retrieval" className="px-3 py-2 text-sm font-medium text-primary hover:text-base-content">Admin</Link>
                    <Link to="/admin/xpath-debug" className="px-3 py-2 text-sm font-medium text-primary hover:text-base-content">XPath Debug</Link>
                  </>
                )}
                <div className="ml-2 flex size-11 items-center justify-center">
                  {isAdmin ? (
                    <form method="post" action="/admin/logout">
                      <button type="submit" className="flex size-11 items-center justify-center rounded-lg text-base-content/60 hover:text-base-content" title="Logout" aria-label="Logout">
                        <SignOut size={20} />
                      </button>
                    </form>
                  ) : (
                    <Link to="/admin/login" className="flex size-11 items-center justify-center rounded-lg text-base-content/60 hover:text-base-content" title="Login" aria-label="Login">
                      <SignIn size={20} />
                    </Link>
                  )}
                </div>
              </nav>
            </div>
          </header>
          <main>
            <Outlet />
          </main>          <footer className="mx-auto mt-20 flex max-w-[1280px] flex-wrap justify-between gap-4 border-t border-base-300 px-4 pb-8 pt-6 text-[13px] text-base-content/60 sm:px-8">
            <span>Listing data from suumo.jp · refreshed daily at 10:30 JST</span>
            {version.commitUrl ? (
              <a
                href={version.commitUrl}
                target="_blank"
                rel="noreferrer"
                className="text-base-content/60 hover:text-base-content"
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
  