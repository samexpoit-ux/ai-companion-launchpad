/**
 * Pricing / chat plan tiers.
 *
 * The plan a workspace picks decides two things:
 *   1. how many credits it gets per period, and
 *   2. which model tiers the smart router is allowed to reach.
 *
 * Free plans never touch the paid coding models — the router silently drops
 * down to the cheap + free chain instead of failing.
 */
export type PlanId = "free" | "starter" | "pro";

/** Coarse capability ceiling used by the router. */
export type TierCeiling = "free" | "cheap" | "premium";

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  cadence: string;
  credits: number;
  /** Highest model tier this plan may use. */
  ceiling: TierCeiling;
  tagline: string;
  perks: string[];
  badge?: string;
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    credits: 5,
    ceiling: "cheap",
    tagline: "Unlimited cheap-tier chat, plus 5 build credits.",
    perks: [
      "5 free build credits / month",
      "Powerful free chat model (DeepSeek)",
      "Chat + plan modes",
      "Live preview, code view & console",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$19",
    cadence: "per month",
    credits: 200,
    ceiling: "premium",
    tagline: "Full coding tier with smart cost routing.",
    perks: [
      "200 credits / month",
      "Claude Sonnet coding tier when needed",
      "Reviewed auto-fix patches",
      "Project export (zip)",
    ],
    badge: "Popular",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49",
    cadence: "per month",
    credits: 600,
    ceiling: "premium",
    tagline: "Heavy multi-file work, long sessions, priority routing.",
    perks: [
      "600 credits / month",
      "Claude Sonnet first on every coding task",
      "Unlimited projects & version history",
      "Priority routing",
    ],
  },
];

export const DEFAULT_PLAN: PlanId = "free";

export function planById(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLANS.some((p) => p.id === value);
}
