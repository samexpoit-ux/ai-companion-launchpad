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
import {
  PageBar,
  PageBody,
  PageEmpty,
  PageHeader,
  PageNote,
  PageSection,
  PageShell,
  PageStat,
  PageStatGrid,
} from "@/components/page-shell";
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
    <PageShell width="lg">
      <PageBar>
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
      </PageBar>

      <PageHeader
        title="Your account"
        description={`${email || "Signed in"}${
          joined ? ` · member since ${new Date(joined).toLocaleDateString()}` : ""
        }`}
      />

      <PageBody>
        {needsUpgrade && (
          <div
            role="status"
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--color-iris)]/30 bg-[color:var(--color-iris)]/8 p-4 sm:p-5"
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

        <PageStatGrid>
          <PageStat label="Plan" value={plan.name} hint={plan.tagline} />
          <PageStat label="Credits left" value={formatCredits(credits.remaining)}>
            <CreditMeter
              plan={credits.plan}
              remaining={credits.remaining}
              total={credits.total}
              compact
              className="mt-2 border-0 bg-transparent p-0"
            />
          </PageStat>
          <PageStat
            label="Workspaces"
            value={threads.length}
            hint="Conversations saved to your account"
          />
        </PageStatGrid>

        <PageSection
          title="Plan & billing"
          description="Credits reset each billing period. Every charge is enforced on the server, so the balance here is the real one."
        >
          <PlanPicker value={credits.plan} onChange={(id) => void choosePlan(id)} />
          {saving && (
            <PageNote>
              <span className="mt-3 block">Switching to {planById(saving).name}…</span>
            </PageNote>
          )}
          {planNotice && (
            <PageNote tone="danger" role="alert">
              <span className="mt-3 block">{planNotice}</span>
            </PageNote>
          )}
        </PageSection>

        <PageSection title="Usage by action">
          {loading ? (
            <PageEmpty>Loading usage…</PageEmpty>
          ) : breakdown.length === 0 ? (
            <PageEmpty>No credits spent yet.</PageEmpty>
          ) : (
            <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl border border-ink-200">
              {breakdown.map((row) => (
                <li key={row.action} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Coins
                    className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-iris)]"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate text-ink-900">{row.label}</span>
                  <span className="ml-auto text-xs text-ink-500">{row.charges}×</span>
                  <span className="w-20 text-right font-mono text-xs text-ink-900">
                    {formatCredits(row.net)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PageSection>

        <PageSection title="Recent activity">
          {loading ? (
            <PageEmpty>Loading activity…</PageEmpty>
          ) : threads.length === 0 ? (
            <PageEmpty>Nothing yet — start a build from the dashboard.</PageEmpty>
          ) : (
            <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl border border-ink-200">
              {threads.slice(0, 8).map((thread) => (
                <li key={thread.id}>
                  <Link
                    to="/workspace"
                    search={{ thread: thread.id }}
                    className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-ink-100"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-ink-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-ink-900">
                      {thread.title || "Untitled build"}
                    </span>
                    <span className="shrink-0 text-xs text-ink-500">
                      {fmtWhen(thread.lastMessageAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </PageSection>

        <p className="flex items-center gap-2 pt-2 text-xs leading-relaxed text-ink-500">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Charges are applied by Nexura AI's servers before a model runs — the browser can never
          grant itself credits.
        </p>
      </PageBody>
    </PageShell>
  );
}
