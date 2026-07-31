// Nexura AI — single-provider gateway (OpenRouter only).
//
// SMART COST ROUTER
// The user never picks a model (same as Lovable). We inspect the task and the
// complexity of the prompt and send it to the cheapest model that can do the job
// well:
//   trivial / short chat  -> free or ultra-cheap model
//   normal chat / plan    -> cheap chat tier
//   coding / bug fixing   -> best coding tier (used only when needed)
// Every route has a fallback chain that ends on free models, so the service keeps
// working even if the paid credit runs out.
//
// All model ids live in `model-tiers.ts` — edit that file, not this one.

import {
  CHEAP_CHAT,
  CODING_PRIMARY,
  CODING_SECONDARY,
  FREE_CODE,
  FREE_FAST,
  FREE_OSS,
  FREE_SMART,
  LIGHT_CODE_CHAIN,
  TIER_CHAINS,
  clampChainToCeiling,
} from "./model-tiers";
import { planById, type PlanId } from "./plans";


export type TaskKind = "chat" | "code" | "reason" | "fix" | "fast";

export interface OpenRouterConfig {
  baseURL: string;
  apiKey: string;
  extraHeaders: Record<string, string>;
}

export interface ResolvedRoute {
  config: OpenRouterConfig;
  upstream: string;
  friendlyId: string;
  task: TaskKind;
  /** Ordered fallbacks if the primary model fails. */
  fallbacks: string[];
}

export function openRouterConfig(): OpenRouterConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return {
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    extraHeaders: {
      "HTTP-Referer": "https://nexuraai.dev",
      "X-Title": "Nexura AI",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Model catalogue — ids come from model-tiers.ts                       */
/* ------------------------------------------------------------------ */

/** Friendly ids kept for backwards compatibility with stored threads. */
export const MODEL_ROUTES: Record<string, { upstream: string; task: TaskKind }> = {
  "nx-auto": { upstream: CHEAP_CHAT, task: "chat" },
  "nx-builder": { upstream: CODING_PRIMARY, task: "code" },
  "nx-reasoner": { upstream: CODING_PRIMARY, task: "reason" },
  "nx-flash": { upstream: CHEAP_CHAT, task: "fast" },
  "nx-vision": { upstream: CODING_SECONDARY, task: "chat" },
};

/** Cheap tier first, expensive tier only for heavy work. */
const TASK_MODELS: Record<TaskKind, string[]> = {
  code: [...TIER_CHAINS.code],
  fix: [...TIER_CHAINS.fix],
  reason: [...TIER_CHAINS.reason],
  chat: [...TIER_CHAINS.chat],
  fast: [...TIER_CHAINS.fast],
};

const FRIENDLY_BY_UPSTREAM: Record<string, string> = {
  [CODING_PRIMARY]: "nx-builder",
  [CODING_SECONDARY]: "nx-vision",
  [CHEAP_CHAT]: "nx-flash",
  [FREE_CODE]: "nx-builder",
  [FREE_SMART]: "nx-auto",
  [FREE_FAST]: "nx-flash",
  [FREE_OSS]: "nx-auto",
};


/* ------------------------------------------------------------------ */
/* Task + complexity detection                                         */
/* ------------------------------------------------------------------ */

const BUILD_HINTS =
  /\b(build|create|make|generate|component|app|page|dashboard|website|landing|ui|refactor|implement|api|function|css|tailwind|react|tsx|typescript|javascript|python|sql|code|bug|error|fix)\b/i;
const REASON_HINTS =
  /\b(why|explain|compare|analy[sz]e|architect|strategy|trade[- ]?off|plan|design a system|prove|step by step|reason)\b/i;
const HEAVY_HINTS =
  /\b(full|complete|entire|multi[- ]?file|project|architecture|production|refactor|migrate|optimi[sz]e|debug|stack trace|test suite|end[- ]to[- ]end)\b/i;
const TRIVIAL_HINTS =
  /^(hi|hey|hello|yo|thanks|thank you|ok|okay|cool|nice|hmm|what'?s up|assalamu.*|salam)\b/i;

/** Auto-detect which kind of work the prompt needs. */
export function detectTask(prompt: string): TaskKind {
  const text = (prompt || "").slice(0, 4000);
  if (!text.trim()) return "chat";
  if (TRIVIAL_HINTS.test(text.trim()) && text.length < 60) return "fast";
  if (/```|<nexusArtifact|\.tsx|\.jsx|\bimport \w/.test(text) || BUILD_HINTS.test(text)) {
    return "code";
  }
  if (REASON_HINTS.test(text)) return "reason";
  if (text.length < 120) return "fast";
  return "chat";
}

/** 0 = trivial, 1 = normal, 2 = heavy. Drives the cost tier. */
export function complexityScore(prompt: string): 0 | 1 | 2 {
  const text = (prompt || "").slice(0, 8000);
  const len = text.length;
  let score = 0;
  if (len > 400) score += 1;
  if (len > 1500) score += 1;
  if (HEAVY_HINTS.test(text)) score += 1;
  if ((text.match(/```/g)?.length ?? 0) >= 2) score += 1;
  if (/\b(file|files)\b/i.test(text) && BUILD_HINTS.test(text)) score += 1;
  if (score >= 2) return 2;
  if (score === 1) return 1;
  return 0;
}

function chainFor(task: TaskKind, prompt: string): string[] {
  const heaviness = complexityScore(prompt);
  if ((task === "code" || task === "fix") && heaviness === 0) return LIGHT_CODE_CHAIN;
  if (task === "chat" && heaviness === 2) return TASK_MODELS.reason;
  return TASK_MODELS[task] ?? TASK_MODELS.chat;
}

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Resolve the model for a request. The UI never sends a model id anymore —
 * routing is fully automatic (Lovable-style). Legacy ids are still honoured.
 */
export function resolveRoute(
  friendlyId: string | undefined,
  options?: { prompt?: string; task?: TaskKind; plan?: PlanId },
): ResolvedRoute | { error: string } {
  const config = openRouterConfig();
  if (!config) {
    return {
      error:
        "OpenRouter is not configured. Add an OPENROUTER_API_KEY secret to enable Nexura AI.",
    };
  }

  const prompt = options?.prompt ?? "";
  const task: TaskKind = options?.task ?? detectTask(prompt);
  const ceiling = planById(options?.plan).ceiling;
  const chain = clampChainToCeiling(chainFor(task, prompt), ceiling);

  // A legacy explicit pick only nudges the chain to the front; it never
  // overrides a cheaper-is-fine decision for trivial prompts.
  const explicit =
    friendlyId && friendlyId !== "nx-auto" ? MODEL_ROUTES[friendlyId]?.upstream : undefined;
  const upstream = explicit && chain.includes(explicit) ? explicit : chain[0];
  const fallbacks = chain.filter((m) => m !== upstream);

  return {
    config,
    upstream,
    friendlyId: FRIENDLY_BY_UPSTREAM[upstream] ?? "nx-auto",
    task,
    fallbacks,
  };
}

/* ------------------------------------------------------------------ */
/* Execution                                                           */
/* ------------------------------------------------------------------ */

/** Keep paid calls bounded so cost stays predictable. */
function maxTokensFor(model: string, task: TaskKind): number {
  const paid = !model.endsWith(":free");
  if (!paid) return 4096;
  if (task === "code" || task === "fix") return 6000;
  if (task === "reason") return 3000;
  return 1600;
}

export async function callChatCompletion(
  config: OpenRouterConfig,
  upstreamModel: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  task: TaskKind = "chat",
): Promise<{ content: string; tokens: number }> {
  const res = await fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      ...config.extraHeaders,
    },
    body: JSON.stringify({
      model: upstreamModel,
      messages,
      temperature: task === "code" || task === "fix" ? 0.2 : 0.7,
      max_tokens: maxTokensFor(upstreamModel, task),
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`[openrouter:${upstreamModel}] ${res.status} ${text.slice(0, 400)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
    error?: { message?: string };
  };
  if (data.error?.message) {
    throw new Error(`[openrouter:${upstreamModel}] ${data.error.message}`);
  }
  const content = data.choices?.[0]?.message?.content ?? "";
  const tokens = data.usage?.total_tokens ?? Math.round(content.length / 3.6);
  return { content, tokens };
}

/** Run the primary model, then walk the fallback chain on failure. */
export async function runWithFallback(
  route: ResolvedRoute,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<{ content: string; tokens: number; upstream: string }> {
  const chain = [route.upstream, ...route.fallbacks];
  let lastError: unknown;
  for (const model of chain) {
    try {
      const out = await callChatCompletion(route.config, model, messages, route.task);
      if (out.content.trim()) return { ...out, upstream: model };
      lastError = new Error(`[openrouter:${model}] empty response`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All OpenRouter models failed");
}
