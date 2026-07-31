import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSettings, saveSetting, type SettingRow } from "@/lib/admin-api";

/** Human labels for the seeded setting keys. */
const LABELS: Record<string, { title: string; hint: string }> = {
  brand: { title: "Branding", hint: "Name and tagline shown across the app" },
  signup: { title: "Sign-up", hint: "Allow new accounts and their starting credits" },
  maintenance: { title: "Maintenance", hint: "Show a maintenance banner to everyone" },
  billing: { title: "Billing mode", hint: "Free while OpenRouter runs on free models; switch to pay-as-you-go later" },
};

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  if (typeof value === "boolean") {
    return (
      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    );
  }
  if (typeof value === "number") {
    return (
      <label className="block text-xs text-ink-600">
        {label}
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value || "0"))}
          className="mt-1"
        />
      </label>
    );
  }
  return (
    <label className="block text-xs text-ink-600">
      {label}
      <Input
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </label>
  );
}

export function SettingsTab() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await listSettings());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (key: string, field: string, next: unknown) =>
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, value: { ...r.value, [field]: next } } : r)),
    );

  const persist = async (row: SettingRow) => {
    setSavingKey(row.key);
    try {
      await saveSetting(row.key, row.value);
      toast.success(`${LABELS[row.key]?.title ?? row.key} saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save setting");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <p className="text-sm text-ink-500">Loading settings…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((row) => (
        <div key={row.key} className="space-y-3 rounded-2xl border border-ink-200 bg-white/80 p-4">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">{LABELS[row.key]?.title ?? row.key}</h3>
            <p className="text-xs text-ink-500">{LABELS[row.key]?.hint ?? "Platform setting"}</p>
          </div>
          <div className="space-y-2">
            {Object.entries(row.value).map(([field, val]) => (
              <Field
                key={field}
                label={field.replace(/_/g, " ")}
                value={val}
                onChange={(next) => patch(row.key, field, next)}
              />
            ))}
          </div>
          <Button
            className="w-full"
            disabled={savingKey === row.key}
            onClick={() => void persist(row)}
          >
            {savingKey === row.key ? "Saving…" : "Save"}
          </Button>
        </div>
      ))}
    </div>
  );
}
