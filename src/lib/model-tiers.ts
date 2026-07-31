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

/** Paid tier — coding quality. */
export const CODING_PRIMARY = "anthropic/claude-3.7-sonnet";
export const CODING_SECONDARY = "anthropic/claude-3.5-sonnet";

/** Cheap tier — chat, plan, titles. */
export const CHEAP_CHAT = "anthropic/claude-3.5-haiku";

/** Free safety net so the product keeps working when credit runs out. */
export const FREE_CODE = "cohere/north-mini-code:free";
export const FREE_SMART = "nvidia/nemotron-3-super-120b-a12b:free";
export const FREE_FAST = "nvidia/nemotron-nano-9b-v2:free";
export const FREE_OSS = "openai/gpt-oss-20b:free";

/** Ordered chains: [primary, ...fallbacks]. */
export const TIER_CHAINS = {
  code: [CODING_PRIMARY, CODING_SECONDARY, CHEAP_CHAT, FREE_CODE, FREE_OSS],
  fix: [CODING_PRIMARY, CODING_SECONDARY, CHEAP_CHAT, FREE_CODE, FREE_OSS],
  reason: [CODING_PRIMARY, CHEAP_CHAT, FREE_SMART, FREE_OSS],
  chat: [CHEAP_CHAT, FREE_SMART, FREE_OSS],
  fast: [FREE_FAST, CHEAP_CHAT, FREE_OSS],
} as const;

/** Small code question — no need to pay Sonnet prices. */
export const LIGHT_CODE_CHAIN = [CHEAP_CHAT, CODING_PRIMARY, FREE_CODE, FREE_OSS];
