/**
 * Credit balance for the signed-in user.
 *
 * The balance is authoritative on the server: `credit_balance()` computes it
 * from `user_settings` (allowance) + `credit_ledger` (spend) inside the
 * database, and only `spend_credits()` — called from `/api/chat` and
 * `/api/autofix` — can write a charge. The browser therefore never charges
 * itself; it only reads the balance and applies the number the server returned
 * with the response, so the UI shows the exact credits that were consumed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { estimateCost, type CreditAction } from "@/lib/credits";
import { DEFAULT_PLAN, isPlanId, planById, type PlanId } from "@/lib/plans";

interface CreditState {
  plan: PlanId;
  total: number;
  used: number;
  loading: boolean;
}

interface BalancePayload {
  plan?: string;
  total?: number;
  used?: number;
  remaining?: number;
  period_start?: string;
}

export interface UseCredits extends CreditState {
  remaining: number;
  /** Cost preview for an action, before it runs. */
  quote: (action: CreditAction, inputChars?: number) => number;
  /** True when the balance covers the action (server re-checks anyway). */
  canAfford: (action: CreditAction, inputChars?: number) => boolean;
  /** Apply the authoritative balance returned by a billable API response. */
  applyServerBalance: (payload: {
    remaining?: number;
    total?: number;
    used?: number;
    plan?: string;
  }) => void;
  setPlan: (plan: PlanId) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCredits(): UseCredits {
  const [state, setState] = useState<CreditState>({
    plan: DEFAULT_PLAN,
    total: planById(DEFAULT_PLAN).credits,
    used: 0,
    loading: true,
  });

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user?.id) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    const { data, error } = await supabase.rpc("credit_balance", {});
    if (error) {
      console.error("[credits] balance read failed", error.message);
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    const payload = (data ?? {}) as BalancePayload;
    const plan: PlanId = isPlanId(payload.plan) ? payload.plan : DEFAULT_PLAN;
    setState({
      plan,
      total: Number(payload.total ?? planById(plan).credits),
      used: Number(payload.used ?? 0),
      loading: false,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyServerBalance = useCallback<UseCredits["applyServerBalance"]>((payload) => {
    setState((s) => {
      const total = Number.isFinite(payload.total) ? Number(payload.total) : s.total;
      const used = Number.isFinite(payload.used)
        ? Number(payload.used)
        : Number.isFinite(payload.remaining)
          ? Math.max(0, total - Number(payload.remaining))
          : s.used;
      return {
        ...s,
        plan: isPlanId(payload.plan) ? payload.plan : s.plan,
        total,
        used,
      };
    });
  }, []);

  const setPlan = useCallback(async (plan: PlanId) => {
    const total = planById(plan).credits;
    setState((s) => ({ ...s, plan, total }));
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: userId, plan, credits_total: total }, { onConflict: "user_id" });
    if (error) console.error("[credits] setPlan failed", error.message);
    await load();
  }, [load]);

  const remaining = useMemo(() => Math.max(0, state.total - state.used), [state.total, state.used]);

  return {
    ...state,
    remaining,
    quote: (action, inputChars) => estimateCost(action, inputChars ?? 0),
    canAfford: (action, inputChars) => remaining >= estimateCost(action, inputChars ?? 0),
    applyServerBalance,
    setPlan,
    refresh: load,
  };
}
