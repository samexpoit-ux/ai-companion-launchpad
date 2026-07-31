import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <main className="min-h-dvh bg-white px-4 py-8 text-ink-900 md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/dashboard">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Dashboard
            </Link>
          </Button>
          {admin && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-600">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Admin view
            </span>
          )}
        </div>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Credit usage &amp; audit log</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          Every chat, plan, build, auto-fix, preview run and export writes one ledger row. Roll a
          charge back and the refund is recorded next to it — nothing is ever deleted.
        </p>

        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Remaining" value={formatCredits(credits.remaining)} />
          <Stat label="Charged this period" value={formatCredits(net)} />
          <Stat label="Ledger entries" value={String(entries.length)} />
        </dl>

        {notice && (
          <p role="status" className="mt-4 rounded-xl border border-ink-200 bg-ink-100 px-3 py-2 text-xs text-ink-700">
            {notice}
          </p>
        )}

        <Section title="Per-action breakdown">
          {breakdown.length === 0 ? (
            <Empty>No credits used yet.</Empty>
          ) : (
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Credits grouped by action</caption>
              <thead className="text-[10px] uppercase tracking-wider text-ink-500">
                <tr>
                  <th scope="col" className="py-2">Action</th>
                  <th scope="col" className="py-2">Charges</th>
                  <th scope="col" className="py-2">Charged</th>
                  <th scope="col" className="py-2">Refunded</th>
                  <th scope="col" className="py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr key={row.action} className="border-t border-ink-200">
                    <td className="py-2 font-medium">{row.label}</td>
                    <td className="py-2 text-ink-600">{row.charges}</td>
                    <td className="py-2 text-ink-600">{formatCredits(row.credits)}</td>
                    <td className="py-2 text-ink-600">{formatCredits(row.refunded)}</td>
                    <td className="py-2 font-semibold">{formatCredits(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Ledger">
          {loading ? (
            <Empty>Loading charges…</Empty>
          ) : entries.length === 0 ? (
            <Empty>No charges recorded.</Empty>
          ) : (
            <ul className="divide-y divide-ink-200">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-xs">
                  <span className="font-medium">{entry.action}</span>
                  <span className="text-ink-500">{entry.tier}</span>
                  <span className={entry.credits < 0 ? "font-semibold text-emerald-600" : "font-semibold"}>
                    {entry.credits < 0 ? "+" : "−"}
                    {formatCredits(Math.abs(entry.credits))}
                  </span>
                  {entry.model && <span className="truncate text-ink-500">{entry.model}</span>}
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
                      <span className="text-[10px] uppercase tracking-wider text-ink-500">
                        Rolled back
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-emerald-600">
                        Refund
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Audit log">
          {audit.length === 0 ? (
            <Empty>No audit events yet.</Empty>
          ) : (
            <ul className="divide-y divide-ink-200">
              {audit.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
                  <span className="rounded-full border border-ink-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-600">
                    {event.event}
                  </span>
                  <span className="font-medium">{event.action ?? "—"}</span>
                  <span className="text-ink-600">{formatCredits(event.credits)}</span>
                  <span className="text-ink-400">{fmtWhen(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white/70 px-3 py-2.5">
      <dt className="text-[10px] uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-600">{title}</h2>
      <div className="mt-2 rounded-2xl border border-ink-200 bg-white/70 px-3 py-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-xs text-ink-500">{children}</p>;
}
