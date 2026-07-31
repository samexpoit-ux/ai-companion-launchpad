import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listPlans, savePlan, type PlanRow } from "@/lib/admin-api";

export function PlansTab() {
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await listPlans());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (id: string, changes: Partial<PlanRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));

  const persist = async (plan: PlanRow) => {
    setSavingId(plan.id);
    try {
      await savePlan(plan);
      toast.success(`${plan.name} saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save plan");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <p className="text-sm text-ink-500">Loading plans…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {rows.map((plan) => (
        <div key={plan.id} className="space-y-3 rounded-2xl border border-ink-200 bg-white/80 p-4">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-ink-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              {plan.slug}
            </span>
            <label className="flex items-center gap-2 text-xs text-ink-600">
              <input
                type="checkbox"
                checked={plan.isActive}
                onChange={(e) => patch(plan.id, { isActive: e.target.checked })}
              />
              Active
            </label>
          </div>

          <label className="block text-xs text-ink-600">
            Name
            <Input
              value={plan.name}
              onChange={(e) => patch(plan.id, { name: e.target.value })}
              className="mt-1"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-ink-600">
              Price (USD)
              <Input
                type="number"
                min={0}
                step="0.01"
                value={(plan.priceCents / 100).toString()}
                onChange={(e) =>
                  patch(plan.id, { priceCents: Math.round(Number(e.target.value || "0") * 100) })
                }
                className="mt-1"
              />
            </label>
            <label className="block text-xs text-ink-600">
              Credits / month
              <Input
                type="number"
                min={0}
                value={plan.monthlyCredits}
                onChange={(e) => patch(plan.id, { monthlyCredits: Number(e.target.value || "0") })}
                className="mt-1"
              />
            </label>
          </div>

          <label className="block text-xs text-ink-600">
            Description
            <Input
              value={plan.description ?? ""}
              onChange={(e) => patch(plan.id, { description: e.target.value })}
              className="mt-1"
            />
          </label>

          <label className="block text-xs text-ink-600">
            Features (one per line)
            <textarea
              value={plan.features.join("\n")}
              onChange={(e) =>
                patch(plan.id, { features: e.target.value.split("\n").map((f) => f.trim()).filter(Boolean) })
              }
              rows={4}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm"
            />
          </label>

          <Button
            className="w-full"
            disabled={savingId === plan.id}
            onClick={() => void persist(plan)}
          >
            {savingId === plan.id ? "Saving…" : "Save plan"}
          </Button>
        </div>
      ))}
    </div>
  );
}
