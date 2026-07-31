import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Coins,
  LogOut,
  MessageSquare,
  Receipt,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreditMeter } from "@/components/CreditMeter";
import { PlanPicker } from "@/components/PlanPicker";
import { supabase } from "@/integrations/supabase/client";
import { useCredits } from "@/hooks/useCredits";
import { formatCredits } from "@/lib/credits";
import { breakdownByAction, listLedger, type LedgerEntry } from "@/lib/credit-ledger";
import { listThreads, type StoredThread } from "@/lib/chat-store";
import { PLANS, planById, type PlanId } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
  head: () => ({
    meta: [
      { title: "Your account & credits — Nexura AI" },
      {
        name: "description",
        content:
          "Manage your Nexura AI workspace: plan, credit balance, per-action usage and your most recent builds.",
      },
      { property: "og:title", content: "Your account & credits — Nexura AI" },
      {
        property: "og:description",
        content: "Plan, credit balance, usage breakdown and recent workspace activity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString();
}

function AccountPage() {
  const credits = useCredits();
  const [email, setEmail] = useState<string>("");
  const [joined, setJoined] = useState<string>("");
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [threads, setThreads] = useState<StoredThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PlanId | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    setEmail(auth.user?.email ?? "");
    setJoined(auth.user?.created_at ?? "");
    const [rows, convos] = await Promise.all([listLedger({ scope: "mine" }), listThreads()]);
    setLedger(rows);
    setThreads(convos);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const breakdown = useMemo(() => breakdownByAction(ledger), [ledger]);
  const plan = planById(credits.plan);
  const nextPlan = PLANS[Math.min(PLANS.findIndex((p) => p.id === plan.id) + 1, PLANS.length - 1)];
  const needsUpgrade = credits.remaining <= 0 && plan.id === "free";

  const choosePlan = useCallback(
    async (id: PlanId) => {
      setSaving(id);
      setPlanNotice(null);
      const result = await credits.setPlan(id);
      setSaving(null);
      if (!result.ok) setPlanNotice(result.error ?? "Could not change the plan.");
    },
    [credits],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Dashboard
          </Link>
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/credits">
              <Receipt className="h-4 w-4" aria-hidden="true" /> Full ledger
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={signOut}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </Button>
        </div>
      </div>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          Your account
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {email || "Signed in"}
          {joined ? ` · member since ${new Date(joined).toLocaleDateString()}` : ""}
        </p>
      </header>

      {needsUpgrade && (
        <div
          role="status"
          className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--color-iris)]/30 bg-[color:var(--color-iris)]/8 px-4 py-3"
        >
          <Sparkles className="h-4 w-4 text-[color:var(--color-iris)]" aria-hidden="true" />
          <p className="text-sm text-ink-900">
            You've used all {formatCredits(plan.credits)} free credits. Upgrade to keep building.
          </p>
          <Button
            size="sm"
            className="ml-auto gap-1.5"
            disabled={saving !== null}
            onClick={() => void choosePlan(nextPlan.id)}
          >
            Upgrade to {nextPlan.name} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Account summary">
        <div className="rounded-2xl border border-ink-200 bg-white/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Plan</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">{plan.name}</p>
          <p className="mt-1 text-xs text-ink-500">{plan.tagline}</p>
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Credits left
          </p>
          <p className="mt-1 text-xl font-semibold text-ink-900">
            {formatCredits(credits.remaining)}
          </p>
          <CreditMeter
            plan={credits.plan}
            remaining={credits.remaining}
            total={credits.total}
            compact
            className="mt-2 border-0 bg-transparent p-0"
          />
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Workspaces
          </p>
          <p className="mt-1 text-xl font-semibold text-ink-900">{threads.length}</p>
          <p className="mt-1 text-xs text-ink-500">Conversations saved to your account</p>
        </div>
      </section>

      <section
        className="mt-10 rounded-2xl border border-ink-200 bg-white/70 p-5"
        aria-labelledby="plan-heading"
      >
        <h2 id="plan-heading" className="font-display text-lg font-bold tracking-tight text-ink-900">
          Plan &amp; billing
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Credits reset each billing period. Every charge is enforced on the server, so the balance
          here is the real one.
        </p>
        <PlanPicker
          value={credits.plan}
          onChange={(id) => void choosePlan(id)}
          className="mt-4"
        />
        {saving && <p className="mt-2 text-xs text-ink-500">Switching to {planById(saving).name}…</p>}
        {planNotice && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {planNotice}
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="usage-heading">
        <h2 id="usage-heading" className="text-sm font-semibold text-ink-900">
          Usage by action
        </h2>
        {loading ? (
          <p className="mt-3 text-xs text-ink-500">Loading usage…</p>
        ) : breakdown.length === 0 ? (
          <p className="mt-3 text-xs text-ink-500">No credits spent yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-200 overflow-hidden rounded-2xl border border-ink-200 bg-white/70">
            {breakdown.map((row) => (
              <li key={row.action} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Coins
                  className="h-3.5 w-3.5 text-[color:var(--color-iris)]"
                  aria-hidden="true"
                />
                <span className="text-ink-900">
                  {row.label}
                </span>
                <span className="ml-auto text-xs text-ink-500">{row.charges}×</span>
                <span className="w-20 text-right font-mono text-xs text-ink-900">
                  {formatCredits(row.net)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-sm font-semibold text-ink-900">
          Recent activity
        </h2>
        {loading ? (
          <p className="mt-3 text-xs text-ink-500">Loading activity…</p>
        ) : threads.length === 0 ? (
          <p className="mt-3 text-xs text-ink-500">
            Nothing yet — start a build from the dashboard.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-200 overflow-hidden rounded-2xl border border-ink-200 bg-white/70">
            {threads.slice(0, 8).map((thread) => (
              <li key={thread.id}>
                <Link
                  to="/workspace"
                  search={{ thread: thread.id }}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-ink-100"
                >
                  <MessageSquare className="h-3.5 w-3.5 text-ink-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-ink-900">
                    {thread.title || "Untitled build"}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-500">
                    {fmtWhen(thread.lastMessageAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 flex items-center gap-2 text-[11px] text-ink-500">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Charges are applied by Nexura AI's servers before a model runs — the browser can never
        grant itself credits.
      </p>
    </main>
  );
}
