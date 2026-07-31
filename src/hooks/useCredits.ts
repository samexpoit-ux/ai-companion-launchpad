/**
 * Credit balance + charging, backed by `user_settings` (allowance) and
 * `credit_ledger` (spend). Exposed as one hook so every surface — dashboard
 * hero, workspace header, preview panel — shows the same remaining number.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { estimateCost, type CreditAction, ACTION_RULES } from "@/lib/credits";
import { DEFAULT_PLAN, isPlanId, planById, type PlanId } from "@/lib/plans";

interface CreditState {
  plan: PlanId;
  total: number;
  used: number;
  loading: boolean;
}

export interface UseCredits extends CreditState {
  remaining: number;
  /** Cost preview for an action, before it runs. */
  quote: (action: CreditAction, inputChars?: number) => number;
  /** True when the balance covers the action. */
  canAfford: (action: CreditAction, inputChars?: number) => boolean;
  /** Write a ledger row and update the local balance. Returns credits left. */
  charge: (
    action: CreditAction,
    opts?: { inputChars?: number; model?: string | null; threadId?: string | null },
  ) => Promise<number>;
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
    const userId = auth.user?.id;
    if (!userId) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    let settings = (
      await supabase
        .from("user_settings")
        .select("plan,credits_total,period_start")
        .eq("user_id", userId)
        .maybeSingle()
    ).data;

    if (!settings) {
      const inserted = await supabase
        .from("user_settings")
        .insert({ user_id: userId, plan: DEFAULT_PLAN, credits_total: planById(DEFAULT_PLAN).credits })
        .select("plan,credits_total,period_start")
        .single();
      if (inserted.error) console.error("[credits] settings insert failed", inserted.error.message);
      settings = inserted.data ?? null;
    }

    const plan: PlanId = isPlanId(settings?.plan) ? settings.plan : DEFAULT_PLAN;
    const total = settings?.credits_total ?? planById(plan).credits;
    const periodStart = settings?.period_start ?? new Date(0).toISOString();

    const ledger = await supabase
      .from("credit_ledger")
      .select("credits")
      .gte("created_at", periodStart);
    if (ledger.error) console.error("[credits] ledger read failed", ledger.error.message);
    const used = (ledger.data ?? []).reduce((sum, row) => sum + Number(row.credits ?? 0), 0);

    setState({ plan, total, used, loading: false });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const charge = useCallback<UseCredits["charge"]>(
    async (action, opts) => {
      const cost = estimateCost(action, opts?.inputChars ?? 0);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (userId) {
        const { error } = await supabase.from("credit_ledger").insert({
          user_id: userId,
          action,
          tier: ACTION_RULES[action].tier,
          credits: cost,
          model: opts?.model ?? null,
          thread_id: opts?.threadId ?? null,
        });
        if (error) console.error("[credits] charge failed", error.message);
      }
      let left = 0;
      setState((s) => {
        const used = s.used + cost;
        left = Math.max(0, s.total - used);
        return { ...s, used };
      });
      return left;
    },
    [],
  );

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
  }, []);

  const remaining = useMemo(() => Math.max(0, state.total - state.used), [state.total, state.used]);

  return {
    ...state,
    remaining,
    quote: (action, inputChars) => estimateCost(action, inputChars ?? 0),
    canAfford: (action, inputChars) => remaining >= estimateCost(action, inputChars ?? 0),
    charge,
    setPlan,
    refresh: load,
  };
}
