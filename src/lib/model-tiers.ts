/**
 * SINGLE SOURCE OF TRUTH FOR MODELS (edit only this file).
 *
 * Nexura hides models from users — the smart router picks the cheapest model
 * that can do the job (same behaviour as Lovable). Swap any OpenRouter model id
 * below and the whole app follows: chat, plan, coding and auto-fix.
 *
 * Cost policy:
 *   fast   — greetings/one-liners       → cheapest / free
 *   chat   — everyday chat + planning   → cheap (Haiku class)
 *   reason — architecture, plans        → mid
 *   code   — building, refactors        → best coding model (Claude 3.7/3.5 Sonnet)
 *   fix    — runtime error auto-fix     → best coding model
 */

/**
 * POLICY (chosen strategy):
 *   build / fix  → Claude Sonnet class (best code structure), cheap coders as fallback
 *   chat / plan  → DeepSeek chat + Gemini Flash only (lowest cost)
 */

/** Coding tier — best structure first, cheap coders as fallback. */
export const CODING_PRIMARY = "anthropic/claude-3.7-sonnet";
export const CODING_SECONDARY = "anthropic/claude-3.5-sonnet";
export const CODING_TERTIARY = "qwen/qwen-2.5-coder-32b-instruct";

/** Cheap tier — chat, plan, titles. */
export const CHEAP_CHAT = "deepseek/deepseek-chat";
/** Ultra-cheap tier — greetings, titles, one-liners. */
export const NANO_CHAT = "google/gemini-2.0-flash-001";
/** Cheap reasoning/plan model. */
export const CHEAP_REASON = "google/gemini-2.0-flash-001";

/** Free safety net so the product keeps working when credit runs out. */
export const FREE_CODE = "deepseek/deepseek-r1:free";
/**
 * Strongest free chat model on OpenRouter. Free plans get this as their main
 * chat brain so the product still feels premium at $0.
 */
export const FREE_POWER = "deepseek/deepseek-chat:free";
export const FREE_SMART = "meta-llama/llama-3.3-70b-instruct:free";
export const FREE_FAST = "google/gemma-3-12b-it:free";
export const FREE_OSS = "openai/gpt-oss-20b:free";

/** Ordered chains: [primary, ...fallbacks]. */
export const TIER_CHAINS = {
  code: [
    CODING_PRIMARY,
    CODING_SECONDARY,
    CHEAP_CHAT,
    CODING_TERTIARY,
    FREE_CODE,
    FREE_POWER,
    FREE_OSS,
  ],
  fix: [
    CODING_PRIMARY,
    CODING_SECONDARY,
    CHEAP_CHAT,
    CODING_TERTIARY,
    FREE_CODE,
    FREE_POWER,
    FREE_OSS,
  ],
  // Plans stay on the cheap tier — no Claude spend for planning.
  reason: [CHEAP_CHAT, CHEAP_REASON, FREE_POWER, FREE_SMART, FREE_OSS],
  chat: [CHEAP_CHAT, NANO_CHAT, FREE_POWER, FREE_SMART, FREE_OSS],
  fast: [NANO_CHAT, FREE_FAST, FREE_POWER, FREE_OSS],
} as const;

/** Small code question — no need to pay Claude prices. */
export const LIGHT_CODE_CHAIN = [CODING_SECONDARY, CHEAP_CHAT, FREE_CODE, FREE_POWER, FREE_OSS];

/** Models that cost real money, grouped by how expensive they are. */
export const PREMIUM_MODELS: readonly string[] = [
  CODING_PRIMARY,
  CODING_SECONDARY,
];
export const CHEAP_MODELS: readonly string[] = [CHEAP_CHAT, NANO_CHAT, CODING_TERTIARY];


/**
 * Clamp a routing chain to what the selected plan is allowed to use.
 *   "premium" — everything.
 *   "cheap"   — no premium coding models (cheap + free only).
 *   "free"    — free models only.
 * The chain always keeps at least one entry so a request can still run.
 */
export function clampChainToCeiling(
  chain: readonly string[],
  ceiling: "free" | "cheap" | "premium",
): string[] {
  if (ceiling === "premium") return [...chain];
  const blocked =
    ceiling === "free" ? [...PREMIUM_MODELS, ...CHEAP_MODELS] : PREMIUM_MODELS;
  const allowed = chain.filter((m) => !blocked.includes(m));
  if (allowed.length > 0) return allowed;
  // Nothing survived the clamp: fall back to the strongest free chat model so a
  // free / out-of-credit account still gets a good answer instead of an error.
  return [FREE_POWER, FREE_OSS];
}

