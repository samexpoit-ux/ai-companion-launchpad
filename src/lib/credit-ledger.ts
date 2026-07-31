/**
 * Credit ledger reads, per-action breakdown, rollback and audit trail.
 *
 * Every charge is one `credit_ledger` row. A rollback never deletes that row —
 * it writes a matching negative row that points back at the original
 * (`reversal_of`) and stamps `reversed_at` on it, so the history stays
 * auditable. A database trigger mirrors every ledger write into
 * `credit_audit_log`, which is what the audit view reads.
 */
import { supabase } from "@/integrations/supabase/client";
import { ACTION_RULES, type CreditAction } from "@/lib/credits";

export interface LedgerEntry {
  id: string;
  userId: string;
  action: string;
  tier: string;
  credits: number;
  model: string | null;
  threadId: string | null;
  reason: string | null;
  reversalOf: string | null;
  reversedAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  userId: string;
  actorId: string | null;
  ledgerId: string | null;
  event: string;
  action: string | null;
  credits: number;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ActionBreakdown {
  action: string;
  label: string;
  charges: number;
  credits: number;
  refunded: number;
  net: number;
}

const LEDGER_COLUMNS =
  "id,user_id,action,tier,credits,model,thread_id,reason,reversal_of,reversed_at,created_at";

type LedgerRow = {
  id: string;
  user_id: string;
  action: string;
  tier: string;
  credits: number;
  model: string | null;
  thread_id: string | null
  reason?: string | null;
  reversal_of?: string | null;
  reversed_at?: string | null;
  created_at: string;
};

function ledgerFromRow(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    tier: row.tier,
    credits: Number(row.credits ?? 0),
    model: row.model,
    threadId: row.thread_id,
    reason: row.reason ?? null,
    reversalOf: row.reversal_of ?? null,
    reversedAt: row.reversed_at ?? null,
    createdAt: row.created_at,
  };
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** True when the signed-in account has the admin role. */
export async function isAdmin(): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    console.error("[ledger] role check failed", error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * Ledger rows, newest first. `scope: "all"` is only useful for admins — RLS
 * silently limits everyone else to their own rows.
 */
export async function listLedger(opts?: {
  since?: string;
  limit?: number;
  scope?: "mine" | "all";
}): Promise<LedgerEntry[]> {
  let q = supabase.from("credit_ledger").select(LEDGER_COLUMNS);
  if (opts?.scope !== "all") {
    const userId = await currentUserId();
    if (!userId) return [];
    q = q.eq("user_id", userId);
  }
  if (opts?.since) q = q.gte("created_at", opts.since);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 300);
  if (error) {
    console.error("[ledger] listLedger failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => ledgerFromRow(row as LedgerRow));
}

/** The audit trail written by the database trigger for every ledger event. */
export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("credit_audit_log")
    .select("id,user_id,actor_id,ledger_id,event,action,credits,details,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ledger] listAudit failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    actorId: row.actor_id,
    ledgerId: row.ledger_id,
    event: row.event,
    action: row.action,
    credits: Number(row.credits ?? 0),
    details: (row.details ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  }));
}

/** Group ledger rows per action, keeping refunds visible next to charges. */
export function breakdownByAction(entries: LedgerEntry[]): ActionBreakdown[] {
  const map = new Map<string, ActionBreakdown>();
  for (const entry of entries) {
    const key = entry.action;
    const label = ACTION_RULES[key as CreditAction]?.label ?? key;
    const row = map.get(key) ?? { action: key, label, charges: 0, credits: 0, refunded: 0, net: 0 };
    if (entry.credits < 0) row.refunded += Math.abs(entry.credits);
    else {
      row.charges += 1;
      row.credits += entry.credits;
    }
    row.net = Math.round((row.credits - row.refunded) * 100) / 100;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

/** Net credits consumed (charges minus rollbacks). */
export function netCredits(entries: LedgerEntry[]): number {
  return Math.round(entries.reduce((sum, e) => sum + e.credits, 0) * 100) / 100;
}

export interface RollbackResult {
  ok: boolean;
  error?: string;
  refunded?: number;
}

/**
 * Refund one charge. Writes the negative counter-entry, marks the original as
 * reversed, and lets the audit trigger record both sides.
 */
export async function rollbackCharge(entry: LedgerEntry, reason: string): Promise<RollbackResult> {
  if (entry.credits <= 0) return { ok: false, error: "Only a charge can be rolled back." };
  if (entry.reversedAt) return { ok: false, error: "This charge was already rolled back." };

  // Rollbacks go through the admin-only database routine: ledger rows are no
  // longer writable from the browser, so the reversal + stamp stay atomic.
  const { error } = await supabase.rpc("rollback_charge", {
    _ledger_id: entry.id,
    _reason: reason.trim() || "Manual rollback",
  });

  if (error) {
    console.error("[ledger] rollback failed", error.message);
    return {
      ok: false,
      error: /not allowed/i.test(error.message)
        ? "Only admins can roll back a charge."
        : error.message,
    };
  }

  return { ok: true, refunded: entry.credits };

}
