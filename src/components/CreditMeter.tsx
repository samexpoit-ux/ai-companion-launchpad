import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCredits, usedPct } from "@/lib/credits";
import { planById, type PlanId } from "@/lib/plans";

interface CreditMeterProps {
  plan: PlanId;
  remaining: number;
  total: number;
  /** Cost of the action the user is about to take, shown as "-X". */
  pending?: number;
  className?: string;
  compact?: boolean;
  unlimited?: boolean;
}

/** Remaining credits, the plan name, and the cost of the next action. */
export function CreditMeter({
  plan,
  remaining,
  total,
  pending,
  className,
  compact = false,
  unlimited = false,
}: CreditMeterProps) {
  const pct = usedPct(total - remaining, total);
  const low = remaining <= total * 0.15;

  return (
    <div className={cn("rounded-xl border border-ink-200 bg-white/70 px-3 py-2", className)}>
      <div className="flex items-center gap-2 text-xs">
        <Coins
          className={cn("h-3.5 w-3.5", low ? "text-red-500" : "text-[color:var(--color-iris)]")}
        />
        <span className="font-semibold text-ink-900">
          {unlimited ? "Unlimited" : formatCredits(remaining)}
        </span>
        {!unlimited && <span className="text-ink-500">/ {formatCredits(total)} credits</span>}
        {!compact && (
          <span className="ml-auto rounded-full border border-ink-200 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-ink-500">
            {unlimited ? "Admin" : planById(plan).name}
          </span>
        )}

      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink-200">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            low ? "bg-red-500" : "bg-[color:var(--color-iris)]",
          )}
          style={{ width: unlimited ? "100%" : `${100 - pct}%` }}
        />
      </div>
      {pending != null && pending > 0 && (
        <div className="mt-1 text-2xs text-ink-500">
          This action costs{" "}
          <span className="font-semibold text-ink-800">{formatCredits(pending)}</span> —{" "}
          {formatCredits(Math.max(0, remaining - pending))} left after
        </div>
      )}
      {low && !unlimited && (
        <div className="mt-1 text-2xs font-medium text-red-500">
          Low balance — upgrade your plan to keep building.
        </div>
      )}
    </div>
  );
}
