import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Globe, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageBar, PageBody, PageHeader, PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { verifyCustomDomain } from "@/lib/domains.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/domains")({
  component: DomainsPage,
  head: () => ({
    meta: [
      { title: "Custom domains — Nexura AI" },
      {
        name: "description",
        content:
          "Point your own domain at a shipped Nexura AI project and verify DNS without leaving the workspace.",
      },
      { property: "og:title", content: "Custom domains — Nexura AI" },
      { property: "og:description", content: "DNS-verified domains for shipped projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface DomainRow {
  id: string;
  domain: string;
  target: string | null;
  verification_token: string;
  status: "pending" | "verified" | "failed";
  last_check: string | null;
  verified_at: string | null;
}

const STATUS_STYLE: Record<DomainRow["status"], string> = {
  verified:
    "border-[color:var(--color-mint)]/30 bg-[color:var(--color-mint-soft)] text-[color:var(--color-mint)]",
  pending: "border-ink-200 bg-ink-100 text-ink-500",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

function DomainsPage() {
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [domain, setDomain] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("custom_domains")
      .select("id,domain,target,verification_token,status,last_check,verified_at")
      .order("created_at", { ascending: false });
    setRows((data ?? []) as DomainRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async () => {
    const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
      toast.error("Enter a domain like app.example.com");
      return;
    }
    setSaving(true);
    const { data: me } = await supabase.auth.getUser();
    const { error } = await supabase.from("custom_domains").insert({
      user_id: me.user?.id as string,
      domain: host,
      target: target.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDomain("");
    setTarget("");
    toast.success("Domain added — now add the DNS records below");
    void load();
  }, [domain, load, target]);

  const verify = useCallback(
    async (id: string) => {
      setBusy(id);
      try {
        const res = await verifyCustomDomain({ data: { domainId: id } });
        if (res.verified) toast.success("Domain verified");
        else toast.error(res.detail);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Verification failed");
      } finally {
        setBusy(null);
        void load();
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("Remove this domain?")) return;
      await supabase.from("custom_domains").delete().eq("id", id);
      void load();
    },
    [load],
  );

  return (
    <PageShell width="xl">
      <PageBar>
        <Link
          to="/connectors"
          className="inline-flex items-center gap-2 text-sm text-ink-500 transition hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Connectors
        </Link>
      </PageBar>

      <PageHeader
        title="Custom domains"
        description="Add a domain, point DNS at your deploy target, and Nexura checks the records for you."
      />

      <PageBody>
        <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-ds-xs">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900">
            <span
              className="grid h-8 w-8 place-items-center rounded-lg"
              style={{ background: "linear-gradient(135deg, #0EA5E9, #67E8F9)" }}
            >
              <Globe className="h-4 w-4 text-white" aria-hidden="true" />
            </span>
            Add a domain
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="app.example.com"
              aria-label="Domain"
            />
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Server IP or CNAME target"
              aria-label="Deploy target"
            />
            <Button onClick={() => void add()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              Add
            </Button>
          </div>
        </section>

        <section className="mt-6 space-y-3">
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-500">
              No domains yet. Add one above to serve a shipped project from your own hostname.
            </p>
          ) : (
            rows.map((row) => (
              <article
                key={row.id}
                className="rounded-2xl border border-ink-200 bg-white p-4 shadow-ds-xs"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-900">{row.domain}</p>
                    <p className="truncate text-xs text-ink-500">
                      {row.last_check ?? "Waiting for the first DNS check."}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium",
                      STATUS_STYLE[row.status],
                    )}
                  >
                    {row.status === "verified" ? (
                      <Check className="h-3 w-3" aria-hidden="true" />
                    ) : null}
                    {row.status}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void verify(row.id)}
                    disabled={busy === row.id}
                  >
                    {busy === row.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Check DNS
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove(row.id)}
                    aria-label={`Remove ${row.domain}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>

                <dl className="mt-3 grid gap-2 rounded-xl bg-ink-100 p-3 font-mono text-2xs text-ink-800 sm:grid-cols-2">
                  <div>
                    <dt className="text-ink-500">TXT · _nexura.{row.domain}</dt>
                    <dd className="break-all">{row.verification_token}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">A / CNAME · {row.domain}</dt>
                    <dd className="break-all">{row.target ?? "your server IP"}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </section>
      </PageBody>
    </PageShell>
  );
}
