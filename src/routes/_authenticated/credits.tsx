import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PageBar,
  PageBody,
  PageEmpty,
  PageHeader,
  PageSection,
  PageShell,
  PageStat,
  PageStatGrid,
} from "@/components/page-shell";

import { formatCredits } from "@/lib/credits";
import { useCredits } from "@/hooks/useCredits";
import {
  breakdownByAction,
  isAdmin as checkAdmin,
  listAudit,
  listLedger,
  netCredits,
  rollbackCharge,
  type AuditEntry,
  type LedgerEntry,
} from "@/lib/credit-ledger";

export const Route = createFileRoute("/_authenticated/credits")({
  component: CreditsPage,
  head: () => ({
    meta: [
      { title: "Credit usage & audit log — Nexura AI" },
      {
        name: "description",
        content:
          "Verify every Nexura AI credit charge: per-action breakdown, full ledger, rollbacks and an admin audit log.",
      },
      { property: "og:title", content: "Credit usage & audit log — Nexura AI" },
      {
        property: "og:description",
        content: "Per-action credit breakdown, ledger history and rollback audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString();
}

function CreditsPage() {
  const credits = useCredits();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const isAdminUser = await checkAdmin();
    const [rows, auditRows] = await Promise.all([
      listLedger({ scope: isAdminUser ? "all" : "mine" }),
      listAudit(),
    ]);
    setAdmin(isAdminUser);
    setEntries(rows);
    setAudit(auditRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const breakdown = useMemo(() => breakdownByAction(entries), [entries]);
  const net = useMemo(() => netCredits(entries), [entries]);

  const rollback = async (entry: LedgerEntry) => {
    setBusyId(entry.id);
    const reason = window.prompt("Why is this charge being rolled back?", "Incorrect charge") ?? "";
    const result = await rollbackCharge(entry, reason);
    setBusyId(null);
    setNotice(
      result.ok
        ? `Rolled back ${formatCredits(result.refunded ?? 0)} credits — the refund is in the ledger.`
        : `Rollback failed: ${result.error}`,
    );
    await load();
    await credits.refresh();
  };
  return (
    <PageShell width="lg">
      <PageBar>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Dashboard
          </Link>
        </Button>
        {admin && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-2xs font-semibold uppercase tracking-wider text-ink-600">
            <ShieldCheck className="h-3 w-3" aria-hidden /> Admin view
          </span>
        )}
      </PageBar>

      <PageHeader
        title="Credit usage & audit log"
        description="Every chat, plan, build, auto-fix, preview run and export writes one ledger row. Roll a charge back and the refund is recorded next to it — nothing is ever deleted."
      />

      <PageBody>
        <PageStatGrid>
          <PageStat label="Remaining" value={formatCredits(credits.remaining)} />
          <PageStat label="Charged this period" value={formatCredits(net)} />
          <PageStat label="Ledger entries" value={String(entries.length)} />
        </PageStatGrid>

        {notice && (
          <p
            role="status"
            className="rounded-2xl border border-ink-200 bg-white px-4 py-3 text-xs leading-relaxed text-ink-700"
          >
            {notice}
          </p>
        )}

        <PageSection title="Per-action breakdown">
          {breakdown.length === 0 ? (
            <PageEmpty>No credits used yet.</PageEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Credits grouped by action</caption>
                <thead className="text-2xs uppercase tracking-wider text-ink-500">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Action</th>
                    <th scope="col" className="py-2 pr-3">Charges</th>
                    <th scope="col" className="py-2 pr-3">Charged</th>
                    <th scope="col" className="py-2 pr-3">Refunded</th>
                    <th scope="col" className="py-2">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.action} className="border-t border-ink-200">
                      <td className="py-2.5 pr-3 font-medium text-ink-900">{row.label}</td>
                      <td className="py-2.5 pr-3 text-ink-600">{row.charges}</td>
                      <td className="py-2.5 pr-3 text-ink-600">{formatCredits(row.credits)}</td>
                      <td className="py-2.5 pr-3 text-ink-600">{formatCredits(row.refunded)}</td>
                      <td className="py-2.5 font-semibold text-ink-900">{formatCredits(row.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PageSection>

        <PageSection title="Ledger">
          {loading ? (
            <PageEmpty>Loading charges…</PageEmpty>
          ) : entries.length === 0 ? (
            <PageEmpty>No charges recorded.</PageEmpty>
          ) : (
            <ul className="divide-y divide-ink-200">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 text-xs"
                >
                  <span className="font-medium text-ink-900">{entry.action}</span>
                  <span className="text-ink-500">{entry.tier}</span>
                  <span className={entry.credits < 0 ? "font-semibold text-emerald-600" : "font-semibold text-ink-900"}>
                    {entry.credits < 0 ? "+" : "−"}
                    {formatCredits(Math.abs(entry.credits))}
                  </span>
                  {entry.model && <span className="min-w-0 truncate text-ink-500">{entry.model}</span>}
                  {entry.reason && <span className="text-ink-500">“{entry.reason}”</span>}
                  <span className="text-ink-400">{fmtWhen(entry.createdAt)}</span>
                  <span className="ml-auto">
                    {entry.credits > 0 && !entry.reversedAt ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        disabled={busyId === entry.id}
                        onClick={() => void rollback(entry)}
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden />
                        Roll back
                      </Button>
                    ) : entry.reversedAt ? (
                      <span className="text-2xs uppercase tracking-wider text-ink-500">
                        Rolled back
                      </span>
                    ) : (
                      <span className="text-2xs uppercase tracking-wider text-emerald-600">
                        Refund
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PageSection>

        <PageSection title="Audit log">
          {audit.length === 0 ? (
            <PageEmpty>No audit events yet.</PageEmpty>
          ) : (
            <ul className="divide-y divide-ink-200">
              {audit.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 text-xs"
                >
                  <span className="rounded-full border border-ink-200 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-ink-600">
                    {event.event}
                  </span>
                  <span className="font-medium text-ink-900">{event.action ?? "—"}</span>
                  <span className="text-ink-600">{formatCredits(event.credits)}</span>
                  <span className="text-ink-400">{fmtWhen(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      </PageBody>
    </PageShell>
  );
}

