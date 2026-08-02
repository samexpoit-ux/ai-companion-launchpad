/**
 * Request tracing for model routing + fallback.
 *
 * Every billable AI request gets a short trace id. We log one compact line to
 * the server console (visible in `journalctl -u nexuraai`) and persist a row in
 * `public.request_traces`, which is readable ONLY by accounts holding the admin
 * role (RLS). End users never see the routing internals — the trace id is the
 * single opaque token they can quote in a support request.
 *
 * Server-only: reads SUPABASE_* env vars, never import from a component.
 */
import { createClient } from "@supabase/supabase-js";

export interface TraceAttempt {
  model: string;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface TraceRecord {
  traceId: string;
  endpoint: "chat" | "autofix";
  mode?: string | null;
  task?: string | null;
  plan?: string | null;
  primaryModel?: string | null;
  finalModel?: string | null;
  attempts: TraceAttempt[];
  status: "ok" | "error" | "blocked";
  errorMessage?: string | null;
  promptChars?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  creditsCharged?: number;
  latencyMs?: number;
  threadId?: string | null;
}

/** Short, url-safe, collision-safe enough for a debugging handle. */
export function newTraceId(): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Math.random()}`;
  return `nx_${rand.replace(/-/g, "").slice(0, 12)}`;
}

/** Best-effort user id from the caller's bearer token (no verification needed: only for labelling). */
export function traceUserId(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = header?.split(" ")[1];
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { sub?: string };
    return typeof claims.sub === "string" ? claims.sub : null;
  } catch {
    return null;
  }
}

function consoleLine(record: TraceRecord, userId: string | null) {
  const chain = record.attempts
    .map((a) => `${a.model}${a.ok ? "✓" : "✗"}${a.ms}ms`)
    .join(" → ");
  console.log(
    `[trace ${record.traceId}] ${record.endpoint} status=${record.status} mode=${record.mode ?? "-"} ` +
      `task=${record.task ?? "-"} plan=${record.plan ?? "-"} user=${userId ?? "anon"} ` +
      `primary=${record.primaryModel ?? "-"} final=${record.finalModel ?? "-"} ` +
      `fallbacks=${Math.max(0, record.attempts.length - 1)} in=${record.inputTokens ?? 0} ` +
      `out=${record.outputTokens ?? 0} cost=$${(record.costUsd ?? 0).toFixed(6)} ` +
      `credits=${record.creditsCharged ?? 0} ${record.latencyMs ?? 0}ms | ${chain}` +
      (record.errorMessage ? ` | error=${record.errorMessage.slice(0, 300)}` : ""),
  );
}

/**
 * Persist a trace. Never throws — tracing must not break a working request.
 */
export async function recordTrace(request: Request, record: TraceRecord): Promise<void> {
  const userId = traceUserId(request);
  consoleLine(record, userId);

  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) return;

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    });
    const { error } = await admin.from("request_traces").insert({
      trace_id: record.traceId,
      user_id: userId,
      endpoint: record.endpoint,
      mode: record.mode ?? null,
      task: record.task ?? null,
      plan: record.plan ?? null,
      primary_model: record.primaryModel ?? null,
      final_model: record.finalModel ?? null,
      attempts: record.attempts,
      fallback_count: Math.max(0, record.attempts.length - 1),
      status: record.status,
      error_message: record.errorMessage ? record.errorMessage.slice(0, 2000) : null,
      prompt_chars: Math.round(record.promptChars ?? 0),
      input_tokens: Math.round(record.inputTokens ?? 0),
      output_tokens: Math.round(record.outputTokens ?? 0),
      cost_usd: Number(record.costUsd ?? 0),
      credits_charged: Number(record.creditsCharged ?? 0),
      latency_ms: Math.round(record.latencyMs ?? 0),
      thread_id: record.threadId ?? null,
    });
    if (error) console.error(`[trace ${record.traceId}] persist failed: ${error.message}`);
  } catch (err) {
    console.error(`[trace ${record.traceId}] persist failed`, err);
  }
}
