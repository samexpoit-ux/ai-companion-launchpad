import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { validateProject, type ValidationResult } from "@/lib/validate";
import { usePreview } from "./preview-context";

/** Lint + build validation of the current workspace state, re-run after every patch. */
export default function ValidationBadge() {
  const { payload, revision } = usePreview();
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!payload) return;
    let alive = true;
    setBusy(true);
    const files = payload.files ?? {
      [payload.lang.includes("ts") ? "App.tsx" : "App.jsx"]: payload.code,
    };
    validateProject(files, payload.entry)
      .then((r) => alive && setResult(r))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [payload, revision, nonce]);

  if (!payload) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-2xs transition",
          busy || !result
            ? "border-ink-200 bg-white/60 text-ink-500"
            : result.ok
              ? "border-emerald-300/70 bg-emerald-50/80 text-emerald-800"
              : "border-rose-300/70 bg-rose-50/80 text-rose-800",
        )}
        title="Lint + build validation of the current project"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : result?.ok ? (
          <ShieldCheck className="h-3 w-3" />
        ) : (
          <AlertTriangle className="h-3 w-3" />
        )}
        {busy || !result
          ? "Validating"
          : result.ok
            ? `Build clean${result.warnings ? ` · ${result.warnings}⚠` : ""}`
            : `${result.errors} error${result.errors === 1 ? "" : "s"}`}
      </button>

      {open && result && (
        <div className="absolute right-0 top-8 z-30 w-96 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-2 text-xs text-ink-700">
            <span className="font-medium">Lint &amp; build report</span>
            <span className="text-ink-500">{result.checkedFiles} file(s) compiled</span>
            <button
              onClick={() => setNonce((n) => n + 1)}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-ink-200 px-1.5 py-0.5 text-2xs text-ink-600 hover:bg-ink-50"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              Re-run
            </button>
          </div>
          <ul className="max-h-64 overflow-auto p-2 font-mono text-2xs">
            {result.issues.length === 0 && (
              <li className="text-emerald-700">No lint or build issues found.</li>
            )}
            {result.issues.map((i, idx) => (
              <li key={idx} className={i.level === "error" ? "text-rose-700" : "text-amber-700"}>
                [{i.level}] {i.path}
                {i.line ? `:${i.line}` : ""} — {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
