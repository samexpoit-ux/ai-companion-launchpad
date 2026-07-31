import { useEffect, useState } from "react";
import { listAdminAudit, type AdminAuditRow } from "@/lib/admin-api";

export function AuditTab() {
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void listAdminAudit().then((res) => {
      if (!alive) return;
      setRows(res);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-ink-500">Loading audit log…</p>;
  if (rows.length === 0) return <p className="text-sm text-ink-500">No admin actions recorded yet.</p>;

  return (
    <ol className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="rounded-2xl border border-ink-200 bg-white/80 p-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-xs font-semibold text-[color:var(--color-iris)]">
              {row.action}
            </span>
            <span className="text-xs text-ink-500">
              {row.targetTable ?? "—"}
              {row.targetId ? ` · ${row.targetId}` : ""}
            </span>
            <span className="ml-auto text-xs text-ink-400">
              {new Date(row.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="mt-1 text-xs text-ink-600">by {row.actorId ?? "system"}</div>
          {row.details && Object.keys(row.details).length > 0 && (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-ink-50 p-2 text-[11px] text-ink-700">
              {JSON.stringify(row.details, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  );
}
