/**
 * Credit system (display layer).
 *
 * Nexura shows a workspace credit allowance in the sidebar, the dashboard and
 * the workspace header. Costs are intentionally *not* deducted yet — routing
 * cost tiers live in `model-tiers.ts`, and metering will read from there when
 * usage-based billing is switched on.
 */

export type CreditBalance = { left: number; total: number };

/** Monthly allowance shown across the UI. */
export const CREDITS: CreditBalance = { left: 304, total: 400 };

/** Relative cost weight per routing tier — used for labels today, metering later. */
export const CREDIT_WEIGHTS = {
  fast: 0.2,
  chat: 0.4,
  reason: 1,
  code: 1.5,
  fix: 1.5,
} as const;

export function creditsUsedPct(balance: CreditBalance = CREDITS): number {
  if (balance.total <= 0) return 0;
  return Math.min(100, Math.round(((balance.total - balance.left) / balance.total) * 100));
}
