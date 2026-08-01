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
 * CHEAP-FIRST POLICY (chosen strategy):
 * DeepSeek / Qwen / GLM open-weight coders give Sonnet-class code quality at
 * ~20-40x lower price, so they are the default. Nothing pricier is used.
 */

/** Coding tier — cheap but strong. */
export const CODING_PRIMARY = "deepseek/deepseek-v3.2";
export const CODING_SECONDARY = "z-ai/glm-4.7";
export const CODING_TERTIARY = "qwen/qwen3-coder-next";

/** Cheap tier — chat, plan, titles. */
export const CHEAP_CHAT = "deepseek/deepseek-v4-flash";
/** Ultra-cheap tier — greetings, titles, one-liners. */
export const NANO_CHAT = "qwen/qwen3.7-flash";

/** Free safety net so the product keeps working when credit runs out. */
export const FREE_CODE = "cohere/north-mini-code:free";
export const FREE_SMART = "nvidia/nemotron-3-super-120b-a12b:free";
export const FREE_FAST = "nvidia/nemotron-nano-9b-v2:free";
export const FREE_OSS = "openai/gpt-oss-20b:free";

/** Ordered chains: [primary, ...fallbacks]. */
export const TIER_CHAINS = {
  code: [CODING_PRIMARY, CODING_SECONDARY, CODING_TERTIARY, FREE_CODE, FREE_OSS],
  fix: [CODING_PRIMARY, CODING_SECONDARY, CODING_TERTIARY, FREE_CODE, FREE_OSS],
  reason: [CODING_PRIMARY, CHEAP_CHAT, FREE_SMART, FREE_OSS],
  chat: [CHEAP_CHAT, NANO_CHAT, FREE_SMART, FREE_OSS],
  fast: [NANO_CHAT, FREE_FAST, FREE_OSS],
} as const;

/** Small code question — no need to pay coder prices. */
export const LIGHT_CODE_CHAIN = [CHEAP_CHAT, CODING_PRIMARY, FREE_CODE, FREE_OSS];

/** Models that cost real money, grouped by how expensive they are. */
export const PREMIUM_MODELS: readonly string[] = [
  CODING_PRIMARY,
  CODING_SECONDARY,
  CODING_TERTIARY,
];
export const CHEAP_MODELS: readonly string[] = [CHEAP_CHAT, NANO_CHAT];

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
  return chain.filter((m) => m.endsWith(":free")).slice(0, 1).concat(FREE_OSS);
}

