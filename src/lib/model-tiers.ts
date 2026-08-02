/**
 * SINGLE SOURCE OF TRUTH FOR MODELS (edit only this file).
 *
 * Nexura hides models from users — the smart router picks the cheapest model
 * that can do the job (same behaviour as Lovable). Swap any OpenRouter model id
 * below and the whole app follows: chat, plan, coding and auto-fix.
 *
 * Cost policy:
 *   fast   — greetings/one-liners       → cheapest
 *   chat   — everyday chat + planning   → cheap
 *   reason — architecture, plans        → cheap-mid
 *   code   — building, refactors        → best coding model
 *   fix    — runtime error auto-fix     → best coding model
 *
 * IMPORTANT: every id here must exist on https://openrouter.ai/api/v1/models.
 * Retired ids (claude-3.7-sonnet, gemini-2.0-flash-001, deepseek-chat:free …)
 * silently fell through the fallback chain and builds landed on a weak model —
 * that is why generated code used to be inaccurate.
 */

/** Coding tier — best code structure first, strong cheap coders as fallback. */
export const CODING_PRIMARY = "anthropic/claude-sonnet-4.6";
export const CODING_SECONDARY = "anthropic/claude-sonnet-4.5";
/** Cheap specialist coders (agentic, long context) used before giving up. */
export const CODING_TERTIARY = "moonshotai/kimi-k2.7-code";
export const CODING_BUDGET = "qwen/qwen3-coder-plus";

/** Cheap tier — chat, plan, titles. */
export const CHEAP_CHAT = "deepseek/deepseek-chat-v3.1";
/** Ultra-cheap tier — greetings, titles, one-liners. */
export const NANO_CHAT = "google/gemini-3.1-flash-lite";
/** Cheap reasoning/plan model with a very large context window. */
export const CHEAP_REASON = "z-ai/glm-4.7";

/** Free safety net so the product keeps working when credit runs out. */
export const FREE_CODE = "cohere/north-mini-code:free";
export const FREE_POWER = "nvidia/nemotron-3-super-120b-a12b:free";
export const FREE_SMART = "google/gemma-4-31b-it:free";
export const FREE_FAST = "nvidia/nemotron-3-nano-30b-a3b:free";
export const FREE_OSS = "openai/gpt-oss-20b:free";

/** Ordered chains: [primary, ...fallbacks]. */
export const TIER_CHAINS = {
  code: [
    CODING_PRIMARY,
    CODING_SECONDARY,
    CODING_TERTIARY,
    CODING_BUDGET,
    CHEAP_REASON,
    FREE_CODE,
    FREE_POWER,
    FREE_OSS,
  ],
  fix: [
    CODING_PRIMARY,
    CODING_SECONDARY,
    CODING_TERTIARY,
    CODING_BUDGET,
    CHEAP_REASON,
    FREE_CODE,
    FREE_POWER,
    FREE_OSS,
  ],
  // Plans stay on the cheap tier — no Sonnet spend for planning.
  reason: [CHEAP_REASON, CHEAP_CHAT, FREE_POWER, FREE_SMART, FREE_OSS],
  chat: [CHEAP_CHAT, NANO_CHAT, FREE_POWER, FREE_SMART, FREE_OSS],
  fast: [NANO_CHAT, FREE_FAST, FREE_POWER, FREE_OSS],
} as const;

/** Small code question — no need to pay Sonnet prices. */
export const LIGHT_CODE_CHAIN = [
  CODING_TERTIARY,
  CODING_BUDGET,
  CHEAP_CHAT,
  FREE_CODE,
  FREE_POWER,
  FREE_OSS,
];

/** Models that cost real money, grouped by how expensive they are. */
export const PREMIUM_MODELS: readonly string[] = [CODING_PRIMARY, CODING_SECONDARY];
export const CHEAP_MODELS: readonly string[] = [
  CHEAP_CHAT,
  NANO_CHAT,
  CHEAP_REASON,
  CODING_TERTIARY,
  CODING_BUDGET,
];

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
  const blocked = ceiling === "free" ? [...PREMIUM_MODELS, ...CHEAP_MODELS] : PREMIUM_MODELS;
  const allowed = chain.filter((m) => !blocked.includes(m));
  if (allowed.length > 0) return allowed;
  // Nothing survived the clamp: fall back to the strongest free models so a
  // free / out-of-credit account still gets a good answer instead of an error.
  return [FREE_CODE, FREE_POWER, FREE_OSS];
}
