/**
 * Outbound webhook delivery (server only).
 *
 * Every delivery is signed with the endpoint secret so receivers can verify the
 * payload really came from Nexura:
 *   X-Nexura-Signature: sha256=<hex hmac of the raw body>
 * Deliveries never block the request that triggered them — failures are logged
 * to `webhook_deliveries` and surfaced in the Webhooks page.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type WebhookEvent =
  | "project.built"
  | "project.shipped"
  | "project.deployed"
  | "project.failed"
  | "test.ping";

type AnyClient = SupabaseClient<any, any, any>;

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DeliveryResult {
  webhookId: string;
  url: string;
  status: "delivered" | "failed";
  responseCode?: number;
  error?: string;
  durationMs: number;
}

/** POST one payload to a single endpoint and log the attempt. */
export async function deliverToWebhook(
  client: AnyClient,
  userId: string,
  hook: { id: string; url: string; secret: string },
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<DeliveryResult> {
  const body = JSON.stringify({
    event,
    createdAt: new Date().toISOString(),
    data: payload,
  });
  const started = Date.now();
  let status: "delivered" | "failed" = "failed";
  let responseCode: number | undefined;
  let error: string | undefined;

  try {
    const signature = await sign(hook.secret, body);
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "nexura-ai-webhooks/1",
        "x-nexura-event": event,
        "x-nexura-signature": `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    responseCode = res.status;
    status = res.ok ? "delivered" : "failed";
    if (!res.ok) error = `Endpoint responded ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - started;

  // Logging is best-effort: a missing table must never break a build.
  try {
    await client.from("webhook_deliveries").insert({
      webhook_id: hook.id,
      user_id: userId,
      event,
      status,
      response_code: responseCode ?? null,
      error: error ?? null,
      duration_ms: durationMs,
      payload,
    });
    await client
      .from("webhooks")
      .update({ last_status: status, last_delivery_at: new Date().toISOString() })
      .eq("id", hook.id);
  } catch {
    /* ignore logging failures */
  }

  return { webhookId: hook.id, url: hook.url, status, responseCode, error, durationMs };
}

/** Fan one event out to every active endpoint subscribed to it. */
export async function dispatchWithClient(
  client: AnyClient,
  userId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<DeliveryResult[]> {
  try {
    const { data, error } = await client
      .from("webhooks")
      .select("id,url,secret,events,active")
      .eq("active", true);
    if (error || !data?.length) return [];
    const targets = (data as Array<{ id: string; url: string; secret: string; events: string[] }>)
      .filter((h) => !h.events?.length || h.events.includes(event));
    return await Promise.all(
      targets.map((h) => deliverToWebhook(client, userId, h, event, payload)),
    );
  } catch {
    return [];
  }
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

/**
 * Dispatch from an API route: builds a caller-scoped client from the request's
 * bearer token so RLS still limits the endpoints we can read.
 */
export async function dispatchWebhooks(
  request: Request,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const token = bearer(request);
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!token || !url || !key) return;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await client.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return;
  await dispatchWithClient(client, userId, event, payload);
}
