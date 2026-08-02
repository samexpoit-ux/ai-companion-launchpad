import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Copy, Loader2, Plus, Send, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageBar, PageBody, PageHeader, PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { testWebhook } from "@/lib/webhooks.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/webhooks")({
  component: WebhooksPage,
  head: () => ({
    meta: [
      { title: "Webhooks — Nexura AI" },
      {
        name: "description",
        content:
          "Send signed HTTP events to your own services whenever a Nexura AI project builds, ships or deploys.",
      },
      { property: "og:title", content: "Webhooks — Nexura AI" },
      { property: "og:description", content: "Signed outbound events for your workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const EVENTS = ["project.built", "project.shipped", "project.deployed", "project.failed"] as const;

interface Hook {
  id: string;
  label: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  last_status: string | null;
  last_delivery_at: string | null;
}

interface Delivery {
  id: string;
  event: string;
  status: string;
  response_code: number | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

function WebhooksPage() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([...EVENTS]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, d] = await Promise.all([
      supabase
        .from("webhooks")
        .select("id,label,url,secret,events,active,last_status,last_delivery_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("webhook_deliveries")
        .select("id,event,status,response_code,error,duration_ms,created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setHooks((h.data ?? []) as Hook[]);
    setDeliveries((d.data ?? []) as Delivery[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async () => {
    const target = url.trim();
    if (!/^https?:\/\/.+/i.test(target)) {
      toast.error("Enter a full endpoint URL starting with https://");
      return;
    }
    setSaving(true);
    const { data: me } = await supabase.auth.getUser();
    const { error } = await supabase.from("webhooks").insert({
      user_id: me.user?.id as string,
      label: label.trim() || "Webhook",
      url: target,
      events: events.length ? events : [...EVENTS],
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLabel("");
    setUrl("");
    toast.success("Endpoint added");
    void load();
  }, [events, label, load, url]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this endpoint?")) return;
      await supabase.from("webhooks").delete().eq("id", id);
      void load();
    },
    [load],
  );

  const toggle = useCallback(
    async (hook: Hook) => {
      await supabase.from("webhooks").update({ active: !hook.active }).eq("id", hook.id);
      void load();
    },
    [load],
  );

  const ping = useCallback(
    async (id: string) => {
      setTesting(id);
      try {
        const res = await testWebhook({ data: { webhookId: id } });
        if (res.status === "delivered") {
          toast.success(`Delivered in ${res.durationMs} ms (${res.responseCode})`);
        } else {
          toast.error(res.error ?? "Delivery failed");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delivery failed");
      } finally {
        setTesting(null);
        void load();
      }
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
        title="Webhooks"
        description="Nexura POSTs a signed JSON payload to your endpoint whenever a project builds, ships or deploys."
      />

      <PageBody>
        <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-ds-xs">
          <h2 className="flex items-center gap-2 font-semibold text-ink-900">
            <span
              className="grid h-8 w-8 place-items-center rounded-lg"
              style={{ background: "linear-gradient(135deg, #F59E0B, #FCD34D)" }}
            >
              <Webhook className="h-4 w-4 text-white" aria-hidden="true" />
            </span>
            Add an endpoint
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[200px_1fr_auto]">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (e.g. Slack relay)"
              aria-label="Webhook label"
            />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/hooks/nexura"
              aria-label="Endpoint URL"
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
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EVENTS.map((event) => {
              const on = events.includes(event);
              return (
                <button
                  key={event}
                  type="button"
                  onClick={() =>
                    setEvents((prev) =>
                      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
                    )
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 font-mono text-2xs transition",
                    on
                      ? "border-[color:var(--color-iris)]/40 bg-[color:var(--color-iris)]/10 text-[color:var(--color-iris-ink)]"
                      : "border-ink-200 text-ink-500 hover:bg-ink-100",
                  )}
                  aria-pressed={on}
                >
                  {event}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Every request carries <code className="font-mono">X-Nexura-Signature: sha256=…</code>, an
            HMAC of the raw body using the endpoint secret — verify it before trusting a payload.
          </p>
        </section>

        <section className="mt-6 space-y-3">
          {hooks.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-500">
              No endpoints yet. Add one above to start receiving build events.
            </p>
          ) : (
            hooks.map((hook) => (
              <article
                key={hook.id}
                className="rounded-2xl border border-ink-200 bg-white p-4 shadow-ds-xs"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-900">{hook.label}</p>
                    <p className="truncate font-mono text-xs text-ink-500">{hook.url}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-2xs font-medium",
                      hook.active
                        ? "border-[color:var(--color-mint)]/30 bg-[color:var(--color-mint-soft)] text-[color:var(--color-mint)]"
                        : "border-ink-200 bg-ink-100 text-ink-500",
                    )}
                  >
                    {hook.active ? "Active" : "Paused"}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void toggle(hook)}>
                    {hook.active ? "Pause" : "Resume"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void ping(hook.id)}
                    disabled={testing === hook.id}
                  >
                    {testing === hook.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Test
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(hook.secret);
                      toast.success("Signing secret copied");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Secret
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove(hook.id)}
                    aria-label={`Delete ${hook.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-2xs text-ink-500">
                  {hook.events.map((e) => (
                    <span key={e} className="rounded-full bg-ink-100 px-2 py-0.5 font-mono">
                      {e}
                    </span>
                  ))}
                  {hook.last_delivery_at ? (
                    <span className="ml-auto">
                      Last: {hook.last_status} · {new Date(hook.last_delivery_at).toLocaleString()}
                    </span>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>

        <section className="mt-8">
          <h2 className="font-semibold text-ink-900">Recent deliveries</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-ink-200 bg-white">
            {deliveries.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-500">No deliveries yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-ink-100 text-left text-2xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2">Event</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Code</th>
                    <th className="px-4 py-2">Took</th>
                    <th className="px-4 py-2">When</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-t border-ink-200">
                      <td className="px-4 py-2 font-mono text-xs">{d.event}</td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-2xs font-medium",
                            d.status === "delivered"
                              ? "bg-[color:var(--color-mint-soft)] text-[color:var(--color-mint)]"
                              : "bg-destructive/10 text-destructive",
                          )}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-ink-500">{d.response_code ?? "—"}</td>
                      <td className="px-4 py-2 text-ink-500">
                        {d.duration_ms != null ? `${d.duration_ms} ms` : "—"}
                      </td>
                      <td className="px-4 py-2 text-ink-500">
                        {new Date(d.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </PageBody>
    </PageShell>
  );
}
