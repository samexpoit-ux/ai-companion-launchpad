/**
 * Credit rules.
 *
 * Every billable action has a fixed base cost plus a small size factor, so the
 * UI can show "this will cost X" *before* the request and "Y credits left"
 * right after it. The same table is used by the server ledger write, so the
 * number the user saw is the number that gets charged.
 */
import type { PlanId } from "./plans";
import { planById } from "./plans";

export type CreditAction =
  | "chat"        // everyday conversation
  | "plan"        // plan / architecture mode
  | "code"        // build or edit a project (coding tier)
  | "autofix"     // AI patch for a runtime error
  | "preview_run" // compiling + running the sandbox preview
  | "export";     // download / export a project

export interface ActionRule {
  action: CreditAction;
  label: string;
  /** Credits charged for a normal-sized request. */
  base: number;
  /** Extra credits per 1000 characters of prompt/context. */
  perKChars: number;
  /** Router tier this action maps to. */
  tier: "fast" | "chat" | "reason" | "code" | "fix";
  note: string;
}

export const ACTION_RULES: Record<CreditAction, ActionRule> = {
  chat: { action: "chat", label: "Chat message", base: 0.4, perKChars: 0.1, tier: "chat", note: "Cheap conversational tier" },
  plan: { action: "plan", label: "Plan / architecture", base: 0.8, perKChars: 0.15, tier: "reason", note: "Reasoning tier" },
  code: { action: "code", label: "Build / edit code", base: 1.5, perKChars: 0.25, tier: "code", note: "Coding tier — most expensive" },
  autofix: { action: "autofix", label: "Auto-fix patch", base: 1.5, perKChars: 0.2, tier: "fix", note: "Coding tier, one charge per attempt" },
  preview_run: { action: "preview_run", label: "Run preview", base: 0.1, perKChars: 0, tier: "fast", note: "Compile + run in the sandbox" },
  export: { action: "export", label: "Export project", base: 0.1, perKChars: 0, tier: "fast", note: "Download files as a zip" },
};

/** Round to 2 decimals so displayed and charged values always match. */
const round = (n: number) => Math.round(n * 100) / 100;

/** What this action will cost, given the size of its input. */
export function estimateCost(action: CreditAction, inputChars = 0): number {
  const rule = ACTION_RULES[action];
  return round(rule.base + (rule.perKChars * inputChars) / 1000);
}

export function actualUsageCost(
  action: CreditAction,
  usage: { inputTokens?: number; outputTokens?: number },
): number {
  const rule = ACTION_RULES[action];
  const inputTokens = Math.max(0, usage.inputTokens ?? 0);
  const outputTokens = Math.max(0, usage.outputTokens ?? 0);
  const inputRate = rule.perKChars * 0.75;
  const outputRate = action === "code" || action === "autofix" ? 0.42 : action === "plan" ? 0.28 : 0.16;
  return Math.max(0.1, round(rule.base + (inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate));
}

/** Maximum expected delivery reservation; unused credits are returned later. */
export function usageReservationCost(action: CreditAction, inputChars = 0): number {
  const inputTokens = Math.ceil(Math.max(0, inputChars) / 3.6);
  const maxOutputTokens = action === "code" || action === "autofix" ? 6000 : action === "plan" ? 3000 : 1600;
  return actualUsageCost(action, { inputTokens, outputTokens: maxOutputTokens });
}

/** Map a chat composer mode ("Build" | "Chat" | "Plan") to a billable action. */
export function actionForMode(mode: string): CreditAction {
  const m = mode.toLowerCase();
  if (m === "plan") return "plan";
  if (m === "chat") return "chat";
  return "code";
}

export function creditsForPlan(plan: PlanId): number {
  return planById(plan).credits;
}

export function usedPct(used: number, total: number): number {
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
}

export function formatCredits(value: number): string {
  const rounded = round(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
}

/** Legacy display constant kept so older imports keep compiling. */
export const CREDITS = { left: 40, total: 40 };
