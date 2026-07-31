import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { OverviewTab } from "@/components/admin/OverviewTab";
import { UsersTab } from "@/components/admin/UsersTab";
import { PaymentsTab } from "@/components/admin/PaymentsTab";
import { PlansTab } from "@/components/admin/PlansTab";
import { SettingsTab } from "@/components/admin/SettingsTab";
import { AuditTab } from "@/components/admin/AuditTab";
import { useAdmin } from "@/hooks/useAdmin";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin control panel — Nexura AI" },
      {
        name: "description",
        content:
          "Nexura AI admin panel: monitor users, sales, payments, credit limits, plans, platform settings and the full admin audit trail.",
      },
      { property: "og:title", content: "Admin control panel — Nexura AI" },
      {
        property: "og:description",
        content: "Monitor users, sales, credits, plans and platform settings for Nexura AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "payments", label: "Payments" },
  { id: "plans", label: "Plans" },
  { id: "settings", label: "Settings" },
  { id: "audit", label: "Audit log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function AdminPage() {
  const { isAdmin, loading } = useAdmin();
  const [tab, setTab] = useState<TabId>("overview");

  if (loading) {
    return (
      <PageShell width="lg">
        <p className="text-sm text-ink-500">Checking access…</p>
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell width="md">
        <div className="mx-auto max-w-md py-10 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-ink-400" aria-hidden />
          <h1 className="mt-4 font-display text-xl font-semibold tracking-tight text-ink-900">
            Admins only
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            This control panel is limited to accounts with the admin role.
          </p>
          <Link
            to="/dashboard"
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-[color:var(--color-iris)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to dashboard
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="xl">
      <PageBar>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Dashboard
        </Link>
      </PageBar>

      <PageHeader
        title="Admin control panel"
        description="Monitor growth, manage users and credit limits, track sales, and tune the platform."
      />

      <div role="tablist" aria-label="Admin sections" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`admin-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`admin-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              tab === t.id
                ? "border-[color:var(--color-iris)] bg-[color:var(--color-iris)]/10 font-medium text-ink-900"
                : "border-ink-200 bg-white text-ink-600 hover:bg-ink-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section
        role="tabpanel"
        id={`admin-panel-${tab}`}
        aria-labelledby={`admin-tab-${tab}`}
        className="mt-6 space-y-6"
      >
        {tab === "overview" && <OverviewTab />}
        {tab === "users" && <UsersTab />}
        {tab === "payments" && <PaymentsTab />}
        {tab === "plans" && <PlansTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "audit" && <AuditTab />}
      </section>
    </PageShell>
  );
}

