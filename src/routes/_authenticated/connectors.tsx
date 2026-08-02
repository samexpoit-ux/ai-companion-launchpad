import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Cloud, Github, Globe, Rocket, Webhook, Database } from "lucide-react";
import { PageBar, PageBody, PageHeader, PageShell } from "@/components/page-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/connectors")({
  component: ConnectorsPage,
  head: () => ({
    meta: [
      { title: "Connectors — Nexura AI" },
      {
        name: "description",
        content: "Connect GitHub, deploy targets, database and webhooks to your Nexura AI workspace.",
      },
      { property: "og:title", content: "Connectors — Nexura AI" },
      {
        property: "og:description",
        content: "Available workspace integrations for Nexura AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Status = "live" | "available" | "soon";

const STATUS: Record<Status, { label: string; className: string; dot: string }> = {
  live: {
    label: "Connected",
    className:
      "border-[color:var(--color-mint)]/30 bg-[color:var(--color-mint-soft)] text-[color:var(--color-mint)]",
    dot: "bg-[color:var(--color-mint)]",
  },
  available: {
    label: "Available",
    className:
      "border-[color:var(--color-iris)]/30 bg-[color:var(--color-iris)]/10 text-[color:var(--color-iris-ink)]",
    dot: "bg-[color:var(--color-iris)]",
  },
  soon: {
    label: "Coming soon",
    className: "border-ink-200 bg-ink-100 text-ink-500",
    dot: "bg-ink-400",
  },
};

const CONNECTORS: Array<{
  icon: typeof Github;
  title: string;
  status: Status;
  text: string;
  accent: string;
  action?: { label: string; to: "/workspace" };
}> = [
  {
    icon: Github,
    title: "GitHub",
    status: "available",
    text: "Push every generated file to a new or existing repo straight from Ship project → GitHub.",
    accent: "from-[#1F2937] to-[#4B5563]",
    action: { label: "Open workspace", to: "/workspace" },
  },
  {
    icon: Rocket,
    title: "VPS deploy",
    status: "available",
    text: "Ship a built project to your own server over SSH, or download the runnable zip and deploy anywhere.",
    accent: "from-[color:var(--color-iris)] to-[color:var(--color-iris-cyan)]",
    action: { label: "Ship a project", to: "/workspace" },
  },
  {
    icon: Database,
    title: "Database & auth",
    status: "live",
    text: "Your workspace, chat history, credits and audit log run on the self-hosted Nexura backend.",
    accent: "from-[#059669] to-[#5EEAD4]",
  },
  {
    icon: Cloud,
    title: "OpenRouter models",
    status: "live",
    text: "Smart cost routing picks the cheapest capable model per request, with automatic fallbacks.",
    accent: "from-[#7C3AED] to-[#C084FC]",
  },
  {
    icon: Globe,
    title: "Custom domain",
    status: "soon",
    text: "Point a domain at a shipped project and Nexura will handle DNS verification and TLS.",
    accent: "from-[#0EA5E9] to-[#67E8F9]",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    status: "soon",
    text: "Trigger external workflows whenever a project builds, ships or deploys.",
    accent: "from-[#F59E0B] to-[#FCD34D]",
  },
];

function ConnectorsPage() {
  return (
    <PageShell width="xl">
      <PageBar>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-ink-500 transition hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>
      </PageBar>

      <PageHeader
        title="Connectors"
        description="Everything Nexura can plug into — code hosting, deploy targets, your backend and the model router."
      />

      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTORS.map(({ icon: Icon, title, status, text, accent, action }) => {
            const badge = STATUS[status];
            return (
              <article
                key={title}
                className="flex flex-col rounded-2xl border border-ink-200 bg-white p-5 shadow-ds-xs transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(16,24,40,0.45)]"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br",
                      accent,
                    )}
                  >
                    <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-ink-900">{title}</h2>
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium",
                        badge.className,
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", badge.dot)} />
                      {badge.label}
                    </span>
                  </div>
                </div>

                <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-500">{text}</p>

                {action ? (
                  <Link
                    to={action.to}
                    className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-800 transition hover:border-[color:var(--color-iris)]/40 hover:bg-[color:var(--color-iris)]/8"
                  >
                    {action.label}
                  </Link>
                ) : null}
              </article>
            );
          })}
        </div>
      </PageBody>
    </PageShell>
  );
}
