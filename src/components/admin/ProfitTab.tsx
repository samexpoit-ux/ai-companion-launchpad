import { useCallback, useEffect, useMemo, useState } from "react";
import { DollarSign, Percent, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchUsageReport, type UsageReport } from "@/lib/admin-api";
import { formatUsd } from "@/lib/credit-ledger";
import { formatCredits } from "@/lib/credits";
import {
  DEFAULT_PRICE_PER_CREDIT,
  profitSummary,
  type ProfitRow,
} from "@/lib/profit";

const RANGES = [
  { days: 1, label: "24h" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

const EMPTY: UsageReport = {
  users: [],
  requests: [],
  totals: { requests: 0, credits: 0, tokens: 0, costUsd: 0 },
};

/**
 * Admin-only margin view: what credits were sold for, what the upstream calls
 * actually cost, and where the profit comes from (action, engine, customer).
 */
export function ProfitTab() {
  const [days, setDays] = useState<number>(30);
  const [price, setPrice] = useState<string>(String(DEFAULT_PRICE_PER_CREDIT));
  const [report, setReport] = useState<UsageReport>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (range: number) => {
    setLoading(true);
    setReport(await fetchUsageReport(range));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const perCredit = Number(price) > 0 ? Number(price) : DEFAULT_PRICE_PER_CREDIT;
  const summary = useMemo(() => profitSummary(report, perCredit), [report, perCredit]);
  const healthy = summary.multiple >= 3;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Profit range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              aria-pressed={days === r.days}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                days === r.days
                  ? "border-[color:var(--color-iris)] bg-[color:var(--color-iris)]/10 font-medium text-ink-900"
                  : "border-ink-200 bg-white text-ink-600 hover:bg-ink-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="price-per-credit" className="text-xs text-ink-600">
            Sell price / credit (USD)
          </label>
          <Input
            id="price-per-credit"
            value={price}
            inputMode="decimal"
            onChange={(e) => setPrice(e.target.value)}
            className="h-9 w-24 text-sm"
          />
          <Button variant="outline" size="sm" onClick={() => void load(days)} disabled={loading}>
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Wallet className="h-4 w-4" aria-hidden />}
          label="Credit revenue"
          value={formatUsd(summary.revenueUsd)}
          hint={`${formatCredits(summary.credits)} credits · ${summary.requests} billed requests`}
        />
        <Stat
          icon={<DollarSign className="h-4 w-4" aria-hidden />}
          label="Upstream cost"
          value={formatUsd(summary.costUsd)}
          hint={`${formatUsd(summary.costPerCredit)} per credit`}
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
          label="Gross profit"
          value={formatUsd(summary.profitUsd)}
          hint={`${summary.multiple}× upstream cost`}
          tone={summary.profitUsd >= 0 ? "good" : "bad"}
        />
        <Stat
          icon={<Percent className="h-4 w-4" aria-hidden />}
          label="Margin"
          value={`${summary.marginPct}%`}
          hint={`safe price ≥ ${formatUsd(summary.breakEvenPrice)} / credit`}
          tone={healthy ? "good" : "bad"}
        />
      </div>

      <p
        role="status"
        className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${
          healthy
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {healthy
          ? `Pricing recovers ${summary.multiple}× upstream spend — margin is safe at ${formatUsd(perCredit)} per credit.`
          : `At ${formatUsd(perCredit)} per credit you only recover ${summary.multiple}× upstream spend. Raise the price to at least ${formatUsd(summary.breakEvenPrice)} per credit, or route more traffic to the cheap tier.`}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Profit by action" rows={summary.byAction} loading={loading} />
        <Panel title="Cost by engine" rows={summary.byModel} loading={loading} mono />
      </div>

      <Panel title="Profit by customer" rows={summary.byUser} loading={loading} />
    </div>
  );
}

function Panel({
  title,
  rows,
  loading,
  mono = false,
}: {
  title: string;
  rows: ProfitRow[];
  loading: boolean;
  mono?: boolean;
}) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white">
      <header className="border-b border-ink-200 px-4 py-3">
        <h2 className="text-sm font-medium text-ink-900">{title}</h2>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-ink-100/70 text-left text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Item</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Reqs</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Credits</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Revenue</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Cost</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Profit</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-ink-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-ink-500">
                  No billed usage in this range.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key}>
                <td
                  className={`max-w-[14rem] truncate px-4 py-2.5 text-ink-900 ${
                    mono ? "font-mono text-xs" : ""
                  }`}
                >
                  {row.label}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-600">
                  {row.requests}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-600">
                  {formatCredits(row.credits)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-600">
                  {formatUsd(row.revenueUsd)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-600">
                  {formatUsd(row.costUsd)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono text-xs ${
                    row.profitUsd >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {formatUsd(row.profitUsd)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-600">
                  {row.marginPct}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-500">
        {icon}
        {label}
      </div>
      <p
        className={`mt-1.5 font-display text-xl font-semibold tracking-tight ${
          tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : "text-ink-900"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-2xs text-ink-500">{hint}</p>}
    </div>
  );
}
