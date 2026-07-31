import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, type PlanId } from "@/lib/plans";
import { ACTION_RULES, formatCredits } from "@/lib/credits";

interface PlanPickerProps {
  value: PlanId;
  onChange: (plan: PlanId) => void;
  className?: string;
}

/** Pricing / chat-plan selection. The chosen tier caps what the router may use. */
export function PlanPicker({ value, onChange, className }: PlanPickerProps) {
  return (
    <section className={cn("space-y-4", className)} aria-label="Pricing plans">
      <div className="flex flex-wrap gap-1.5">
        {(["chat", "plan", "code"] as const).map((action) => (
          <span
            key={action}
            className="rounded-full border border-ink-200 bg-white/70 px-2 py-0.5 text-[10px] text-ink-600"
          >
            {ACTION_RULES[action].label} · {formatCredits(ACTION_RULES[action].base)}+
          </span>
        ))}
      </div>


      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const selected = plan.id === value;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onChange(plan.id)}
              aria-pressed={selected}
              className={cn(
                "group relative rounded-2xl border p-4 text-left transition",
                selected
                  ? "border-[color:var(--color-iris)] bg-[color:var(--color-iris)]/[0.06] shadow-lg"
                  : "border-ink-200 bg-white/70 hover:border-ink-300 hover:shadow-md",
              )}
            >
              {plan.badge && (
                <span className="absolute right-3 top-3 rounded-full bg-[color:var(--color-iris)] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white">
                  {plan.badge}
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <span className="font-display text-[15px] font-bold text-ink-900">{plan.name}</span>
                {selected && <Check className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="font-display text-2xl font-bold text-ink-900">{plan.price}</span>
                <span className="text-[11px] text-ink-500">{plan.cadence}</span>
              </div>
              <p className="mt-1 text-[11.5px] text-ink-600">{plan.tagline}</p>
              <ul className="mt-3 space-y-1.5">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-1.5 text-[11.5px] text-ink-700">
                    <Sparkles className="mt-[3px] h-3 w-3 shrink-0 text-[color:var(--color-iris)]" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-[10px] uppercase tracking-wider text-ink-500">
                Model ceiling · {plan.ceiling}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
