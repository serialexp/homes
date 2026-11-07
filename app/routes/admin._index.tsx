import { json } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, PageHeader, PANEL } from "../components/AdminUi.js";

export async function loader() {
  return json({});
}

type CardLink = { to: string; label: string; primary?: boolean };

function DashboardCard({
  id,
  title,
  description,
  links,
}: {
  id: string;
  title: string;
  description: string;
  links: CardLink[];
}) {
  return (
    <section aria-labelledby={id} className={`${PANEL} flex flex-col gap-3 p-6`}>
      <h2 id={id} className="m-0 text-lg font-semibold">
        {title}
      </h2>
      <p className="m-0 text-base-content/70">{description}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-2">
        {links.map((link) => (
          <Link key={link.to} to={link.to} className={link.primary ? BUTTON_PRIMARY : BUTTON_SECONDARY}>
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function AdminIndex() {
  return (
    <>
      <PageHeader title="Admin Dashboard" />
      <div className="grid gap-4 md:grid-cols-2">
        <DashboardCard
          id="card-retrieval"
          title="Property Data Retrieval"
          description="Retrieve property data from external sources and manage retrieval jobs."
          links={[
            { to: "/admin/retrieval", label: "Retrieval Dashboard", primary: true },
            { to: "/admin/retrieval/history", label: "View Job History" },
          ]}
        />
        <DashboardCard
          id="card-xpath"
          title="XPath Debugger"
          description="Debug and test XPath expressions for web scraping."
          links={[{ to: "/admin/xpath-debug", label: "Open XPath Debugger", primary: true }]}
        />
        <DashboardCard
          id="card-rentals"
          title="Buildings & Rental Units"
          description="Manage buildings and rental units in the database."
          links={[{ to: "/admin/rentals", label: "Manage Rentals", primary: true }]}
        />
        <DashboardCard
          id="card-reconcile"
          title="Train Line Reconciliation"
          description="Classify transit lines, match railways to canonical lines, and clean up bus routes."
          links={[{ to: "/admin/reconcile", label: "Open Reconciliation", primary: true }]}
        />
      </div>
    </>
  );
}
