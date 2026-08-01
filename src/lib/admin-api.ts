/**
 * Admin panel data layer.
 *
 * Every call goes through the browser Supabase client, so RLS is the real
 * guard: the admin-only policies added for `profiles`, `payments`, `plans`,
 * `platform_settings`, `user_roles`, `user_settings` and the credit tables
 * mean a non-admin session simply sees nothing instead of relying on the UI
 * to hide it.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/* ------------------------------------------------------------------ types */

export interface AdminOverview {
  users: number;
  newUsers7d: number;
  projects: number;
  threads: number;
  messages: number;
  revenueCents: number;
  pendingPayments: number;
  creditsUsed30d: number;
  creditsRefunded30d: number;
  activeUsers7d: number;
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  displayName: string | null;
  plan: string;
  creditsTotal: number;
  creditsUsed: number;
  isAdmin: boolean;
  createdAt: string | null;
}

export interface PaymentRow {
  id: string;
  userId: string;
  email?: string | null;
  planSlug: string | null;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  providerRef: string | null;
  creditsGranted: number;
  note: string | null;
  createdAt: string;
}

export interface PlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  monthlyCredits: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface SettingRow {
  key: string;
  value: Record<string, unknown>;
  isPublic: boolean;
  updatedAt: string;
}

export interface AdminAuditRow {
  id: string;
  actorId: string | null;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/* --------------------------------------------------------------- overview */

export async function fetchOverview(): Promise<AdminOverview> {
  const since30 = daysAgo(30);
  const since7 = daysAgo(7);

  const count = async (table: "profiles" | "projects" | "chat_threads" | "chat_messages", since?: string) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true });
    if (since) q = q.gte("created_at", since);
    const { count: c, error } = await q;
    if (error) console.error(`[admin] count ${table} failed`, error.message);
    return c ?? 0;
  };

  const [users, newUsers7d, projects, threads, messages] = await Promise.all([
    count("profiles"),
    count("profiles", since7),
    count("projects"),
    count("chat_threads"),
    count("chat_messages"),
  ]);

  const payments = await supabase.from("payments").select("amount_cents,status");
  if (payments.error) console.error("[admin] payments read failed", payments.error.message);
  const rows = payments.data ?? [];
  const revenueCents = rows
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + Number(r.amount_cents ?? 0), 0);
  const pendingPayments = rows.filter((r) => r.status === "pending").length;

  const ledger = await supabase
    .from("credit_ledger")
    .select("credits,user_id,created_at")
    .gte("created_at", since30);
  if (ledger.error) console.error("[admin] ledger read failed", ledger.error.message);
  const ledgerRows = ledger.data ?? [];
  const creditsUsed30d = round(
    ledgerRows.filter((r) => Number(r.credits) > 0).reduce((s, r) => s + Number(r.credits), 0),
  );
  const creditsRefunded30d = round(
    ledgerRows.filter((r) => Number(r.credits) < 0).reduce((s, r) => s + Math.abs(Number(r.credits)), 0),
  );
  const activeUsers7d = new Set(
    ledgerRows.filter((r) => r.created_at >= since7).map((r) => r.user_id),
  ).size;

  return {
    users,
    newUsers7d,
    projects,
    threads,
    messages,
    revenueCents,
    pendingPayments,
    creditsUsed30d,
    creditsRefunded30d,
    activeUsers7d,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ users */

export async function listUsers(search = ""): Promise<AdminUserRow[]> {
  let q = supabase
    .from("profiles")
    .select("id,email,display_name,plan,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    q = q.or(`email.ilike.${term},display_name.ilike.${term}`);
  }
  const profiles = await q;
  if (profiles.error) {
    console.error("[admin] listUsers failed", profiles.error.message);
    return [];
  }

  const ids = (profiles.data ?? []).map((p) => p.id);
  if (ids.length === 0) return [];

  const [settings, roles, ledger] = await Promise.all([
    supabase.from("user_settings").select("user_id,plan,credits_total").in("user_id", ids),
    supabase.from("user_roles").select("user_id,role").in("user_id", ids),
    supabase.from("credit_ledger").select("user_id,credits").in("user_id", ids),
  ]);

  const settingsBy = new Map((settings.data ?? []).map((s) => [s.user_id, s]));
  const adminIds = new Set((roles.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
  const usedBy = new Map<string, number>();
  for (const row of ledger.data ?? []) {
    usedBy.set(row.user_id, (usedBy.get(row.user_id) ?? 0) + Number(row.credits ?? 0));
  }

  return (profiles.data ?? []).map((p) => {
    const s = settingsBy.get(p.id);
    return {
      id: p.id,
      email: p.email,
      displayName: p.display_name,
      plan: s?.plan ?? p.plan ?? "free",
      creditsTotal: Number(s?.credits_total ?? 0),
      creditsUsed: round(usedBy.get(p.id) ?? 0),
      isAdmin: adminIds.has(p.id),
      createdAt: p.created_at,
    };
  });
}

export async function setUserPlan(userId: string, plan: string, creditsTotal: number) {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, plan, credits_total: creditsTotal }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await supabase.from("profiles").update({ plan }).eq("id", userId);
  await logAdmin("user.plan_changed", "user_settings", userId, { plan, creditsTotal });
}

export async function setUserCreditLimit(userId: string, creditsTotal: number) {
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, credits_total: creditsTotal }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await logAdmin("user.credit_limit_changed", "user_settings", userId, { creditsTotal });
}

export async function setUserAdmin(userId: string, makeAdmin: boolean) {
  if (makeAdmin) {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");
    if (error) throw new Error(error.message);
  }
  await logAdmin(makeAdmin ? "user.admin_granted" : "user.admin_revoked", "user_roles", userId, {});
}

/* --------------------------------------------------------------- payments */

export async function listPayments(status?: string): Promise<PaymentRow[]> {
  let q = supabase
    .from("payments")
    .select(
      "id,user_id,plan_slug,amount_cents,currency,status,provider,provider_ref,credits_granted,note,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) {
    console.error("[admin] listPayments failed", error.message);
    return [];
  }
  const rows = (data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    planSlug: r.plan_slug,
    amountCents: Number(r.amount_cents ?? 0),
    currency: r.currency,
    status: r.status,
    provider: r.provider,
    providerRef: r.provider_ref,
    creditsGranted: Number(r.credits_granted ?? 0),
    note: r.note,
    createdAt: r.created_at,
  }));

  const ids = [...new Set(rows.map((r) => r.userId))];
  if (ids.length === 0) return rows;
  const profiles = await supabase.from("profiles").select("id,email").in("id", ids);
  const emailBy = new Map((profiles.data ?? []).map((p) => [p.id, p.email]));
  return rows.map((r) => ({ ...r, email: emailBy.get(r.userId) ?? null }));
}

export async function createPayment(input: {
  userId: string;
  planSlug: string;
  amountCents: number;
  creditsGranted: number;
  status: string;
  provider: string;
  note?: string;
}) {
  const { error } = await supabase.from("payments").insert({
    user_id: input.userId,
    plan_slug: input.planSlug,
    amount_cents: input.amountCents,
    credits_granted: input.creditsGranted,
    status: input.status,
    provider: input.provider,
    note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
  await logAdmin("payment.created", "payments", input.userId, { ...input });
}

export async function updatePaymentStatus(id: string, status: string) {
  const { error } = await supabase.from("payments").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  await logAdmin("payment.status_changed", "payments", id, { status });
}

/* ------------------------------------------------------------------ plans */

function planFromRow(r: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  monthly_credits: number;
  features: unknown;
  is_active: boolean;
  sort_order: number;
}): PlanRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    priceCents: Number(r.price_cents ?? 0),
    currency: r.currency,
    monthlyCredits: Number(r.monthly_credits ?? 0),
    features: Array.isArray(r.features) ? (r.features as string[]) : [],
    isActive: r.is_active,
    sortOrder: r.sort_order,
  };
}

const PLAN_COLUMNS =
  "id,slug,name,description,price_cents,currency,monthly_credits,features,is_active,sort_order";

export async function listPlans(): Promise<PlanRow[]> {
  const { data, error } = await supabase.from("plans").select(PLAN_COLUMNS).order("sort_order");
  if (error) {
    console.error("[admin] listPlans failed", error.message);
    return [];
  }
  return (data ?? []).map(planFromRow);
}

export async function savePlan(plan: PlanRow) {
  const { error } = await supabase
    .from("plans")
    .update({
      name: plan.name,
      description: plan.description,
      price_cents: plan.priceCents,
      monthly_credits: plan.monthlyCredits,
      features: plan.features,
      is_active: plan.isActive,
      sort_order: plan.sortOrder,
    })
    .eq("id", plan.id);
  if (error) throw new Error(error.message);
  await logAdmin("plan.updated", "plans", plan.id, { slug: plan.slug });
}

/* --------------------------------------------------------------- settings */

export async function listSettings(): Promise<SettingRow[]> {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("key,value,is_public,updated_at")
    .order("key");
  if (error) {
    console.error("[admin] listSettings failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    key: r.key,
    value: (r.value ?? {}) as Record<string, unknown>,
    isPublic: r.is_public,
    updatedAt: r.updated_at,
  }));
}

export async function saveSetting(key: string, value: Record<string, unknown>) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("platform_settings")
    .upsert({ key, value: value as Json, updated_by: auth.user?.id ?? null }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  await logAdmin("setting.updated", "platform_settings", key, value);
}

/* ------------------------------------------------------------------ audit */

export async function listAdminAudit(limit = 200): Promise<AdminAuditRow[]> {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id,actor_id,action,target_table,target_id,details,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin] listAdminAudit failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    action: r.action,
    targetTable: r.target_table,
    targetId: r.target_id,
    details: (r.details ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
  }));
}

/** Best-effort audit write — never blocks the action it describes. */
export async function logAdmin(
  action: string,
  targetTable: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("admin_audit_log").insert({
    actor_id: auth.user?.id ?? null,
    action,
    target_table: targetTable,
    target_id: targetId,
    details: details as Json,
  });
  if (error) console.error("[admin] audit write failed", error.message);
}

export const formatMoney = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

/* ------------------------------------------------------------------ usage */

export interface UsageUserRow {
  userId: string;
  email: string | null;
  displayName: string | null;
  plan: string;
  requests: number;
  credits: number;
  refunded: number;
  tokens: number;
  costUsd: number;
  lastUsedAt: string | null;
}

export interface UsageRequestRow {
  id: string;
  userId: string;
  email: string | null;
  action: string;
  tier: string;
  credits: number;
  tokens: number;
  costUsd: number;
  model: string | null;
  upstreamModel: string | null;
  threadId: string | null;
  reason: string | null;
  reversedAt: string | null;
  createdAt: string;
}

export interface UsageReport {
  users: UsageUserRow[];
  requests: UsageRequestRow[];
  totals: { requests: number; credits: number; tokens: number; costUsd: number };
}

const money = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Per-user usage + the full per-request breakdown (tokens, provider cost in USD
 * and the upstream model that answered). Admin-only through RLS.
 */
export async function fetchUsageReport(days = 30, limit = 500): Promise<UsageReport> {
  const since = daysAgo(days);
  const [ledger, profiles, settings] = await Promise.all([
    supabase
      .from("credit_ledger")
      .select(
        "id,user_id,action,tier,credits,model,upstream_model,tokens,cost_usd,thread_id,reason,reversed_at,created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("profiles").select("id,email,display_name,plan").limit(1000),
    supabase.from("user_settings").select("user_id,plan").limit(1000),
  ]);

  if (ledger.error) console.error("[admin] usage read failed", ledger.error.message);

  const profileBy = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const planBy = new Map((settings.data ?? []).map((s) => [s.user_id, s.plan]));

  const requests: UsageRequestRow[] = (ledger.data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    email: profileBy.get(r.user_id)?.email ?? null,
    action: r.action,
    tier: r.tier,
    credits: Number(r.credits ?? 0),
    tokens: Number(r.tokens ?? 0),
    costUsd: Number(r.cost_usd ?? 0),
    model: r.model,
    upstreamModel: r.upstream_model ?? null,
    threadId: r.thread_id,
    reason: r.reason ?? null,
    reversedAt: r.reversed_at ?? null,
    createdAt: r.created_at,
  }));

  const byUser = new Map<string, UsageUserRow>();
  for (const row of requests) {
    const profile = profileBy.get(row.userId);
    const agg =
      byUser.get(row.userId) ??
      ({
        userId: row.userId,
        email: profile?.email ?? null,
        displayName: profile?.display_name ?? null,
        plan: planBy.get(row.userId) ?? profile?.plan ?? "free",
        requests: 0,
        credits: 0,
        refunded: 0,
        tokens: 0,
        costUsd: 0,
        lastUsedAt: null,
      } satisfies UsageUserRow);

    if (row.credits < 0) agg.refunded = round(agg.refunded + Math.abs(row.credits));
    else {
      agg.requests += 1;
      agg.credits = round(agg.credits + row.credits);
    }
    agg.tokens += row.tokens;
    agg.costUsd = money(agg.costUsd + row.costUsd);
    if (!agg.lastUsedAt || row.createdAt > agg.lastUsedAt) agg.lastUsedAt = row.createdAt;
    byUser.set(row.userId, agg);
  }

  const users = [...byUser.values()].sort((a, b) => b.credits - a.credits);
  const totals = {
    requests: requests.filter((r) => r.credits >= 0).length,
    credits: round(requests.reduce((s, r) => s + r.credits, 0)),
    tokens: requests.reduce((s, r) => s + r.tokens, 0),
    costUsd: money(requests.reduce((s, r) => s + r.costUsd, 0)),
  };

  return { users, requests, totals };
}
