import { useEffect, useState } from "react";
import {
  Activity,
  CreditCard,
  FolderKanban,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react";
import { fetchOverview, formatMoney, type AdminOverview } from "@/lib/admin-api";
import { formatCredits } from "@/lib/credits";

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white/80 p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        <Icon className="h-3.5 w-3.5 text-[color:var(--color-iris)]" aria-hidden />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-ink-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </div>
  );
}

export function OverviewTab() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void fetchOverview().then((res) => {
      if (!alive) return;
      setData(res);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading || !data) {
    return <p className="text-sm text-ink-500">Loading platform metrics…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Users"
          value={String(data.users)}
          hint={`${data.newUsers7d} joined in the last 7 days`}
          icon={Users}
        />
        <Stat
          label="Revenue"
          value={formatMoney(data.revenueCents)}
          hint={`${data.pendingPayments} payment(s) pending`}
          icon={CreditCard}
        />
        <Stat
          label="Credits used (30d)"
          value={formatCredits(data.creditsUsed30d)}
          hint={`${formatCredits(data.creditsRefunded30d)} refunded`}
          icon={TrendingUp}
        />
        <Stat
          label="Active builders (7d)"
          value={String(data.activeUsers7d)}
          hint="Accounts that spent credits"
          icon={Activity}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Projects" value={String(data.projects)} icon={FolderKanban} />
        <Stat label="Conversations" value={String(data.threads)} icon={MessageSquare} />
        <Stat label="Messages" value={String(data.messages)} icon={MessageSquare} />
      </div>
    </div>
  );
}
