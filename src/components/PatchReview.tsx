import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import {
  X,
  Check,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  FileDiff,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { collapseContext, diffFile, diffProjects, type FileDiff as FileDiffType } from "@/lib/diff";
import { validateProject, type ValidationResult } from "@/lib/validate";
import { usePreview } from "./preview-context";

/**
 * Review gate: shows the exact diff an AI patch would apply, plus lint/build
 * validation of the patched project, before anything touches the workspace.
 */
export default function PatchReview() {
  const { pendingPatch, applyPendingPatch, discardPendingPatch } = usePreview();
  const [selected, setSelected] = useState<string | null>(null);
  const [before, setBefore] = useState<ValidationResult | null>(null);
  const [after, setAfter] = useState<ValidationResult | null>(null);
  const [checking, setChecking] = useState(false);

  const diffs = useMemo<FileDiffType[]>(() => {
    if (!pendingPatch) return [];
    const prev = pendingPatch.previous;
    const next = pendingPatch.next;
    if (prev.files && next.files) return diffProjects(prev.files, next.files);
    return [diffFile("snippet", prev.code, next.code)];
  }, [pendingPatch]);

  useEffect(() => {
    if (diffs.length > 0) setSelected((s) => (s && diffs.some((d) => d.path === s) ? s : diffs[0].path));
  }, [diffs]);

  useEffect(() => {
    if (!pendingPatch) return;
    let alive = true;
    setChecking(true);
    const prev = pendingPatch.previous;
    const next = pendingPatch.next;
    const asFiles = (p: typeof prev) =>
      p.files ?? { [p.lang.includes("ts") ? "App.tsx" : "App.jsx"]: p.code };
    Promise.all([
      validateProject(asFiles(prev), prev.entry),
      validateProject(asFiles(next), next.entry),
    ])
      .then(([b, a]) => {
        if (!alive) return;
        setBefore(b);
        setAfter(a);
      })
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [pendingPatch]);

  if (!pendingPatch) return null;

  const active = diffs.find((d) => d.path === selected) ?? diffs[0];
  const totalAdd = diffs.reduce((n, d) => n + d.additions, 0);
  const totalDel = diffs.reduce((n, d) => n + d.deletions, 0);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-900/25 p-3 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
          <FileDiff className="h-4 w-4 text-[color:var(--color-iris)]" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink-900">Review AI patch</div>
            <div className="truncate text-[11px] text-ink-500">
              {pendingPatch.summary}
              {pendingPatch.model ? ` · ${pendingPatch.model}` : ""} · attempt {pendingPatch.attempt}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 font-mono text-[11px]">
            <span className="text-emerald-600">+{totalAdd}</span>
            <span className="text-rose-500">−{totalDel}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={discardPendingPatch}
              aria-label="Close review"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Validation summary */}
        <ValidationSummary checking={checking} before={before} after={after} />

        <div className="flex min-h-0 flex-1">
          {/* File list */}
          <div className="w-52 shrink-0 overflow-auto border-r border-ink-200 bg-ink-50/40 p-2">
            {diffs.length === 0 && (
              <div className="px-2 py-3 text-[11px] text-ink-500">No file changes detected.</div>
            )}
            {diffs.map((d) => (
              <button
                key={d.path}
                onClick={() => setSelected(d.path)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition",
                  d.path === active?.path
                    ? "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200"
                    : "text-ink-600 hover:bg-white/70",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    d.status === "added"
                      ? "bg-emerald-500"
                      : d.status === "removed"
                        ? "bg-rose-500"
                        : "bg-sky-500",
                  )}
                />
                <span className="truncate font-mono">{d.path.split("/").pop()}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-400">
                  +{d.additions}/−{d.deletions}
                </span>
              </button>
            ))}
          </div>

          {/* Diff body */}
          <div className="min-w-0 flex-1 overflow-auto bg-white">
            {active && <DiffView diff={active} />}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-ink-200 bg-ink-50/50 px-4 py-2.5">
          <span className="text-[11px] text-ink-500">
            Nothing is applied until you approve this diff.
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={discardPendingPatch}>
              <RotateCcw className="h-3.5 w-3.5" />
              Discard
            </Button>
            <Button size="sm" onClick={applyPendingPatch}>
              <Check className="h-3.5 w-3.5" />
              Apply patch
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValidationSummary({
  checking,
  before,
  after,
}: {
  checking: boolean;
  before: ValidationResult | null;
  after: ValidationResult | null;
}) {
  const [open, setOpen] = useState(false);

  if (checking && !after) {
    return (
      <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-50/60 px-4 py-2 text-[11px] text-ink-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Running lint + build validation…
      </div>
    );
  }
  if (!after) return null;

  const ok = after.ok;
  const delta = before ? before.errors - after.errors : 0;

  return (
    <div
      className={cn(
        "border-b px-4 py-2 text-[11px]",
        ok ? "border-emerald-200 bg-emerald-50/70 text-emerald-900" : "border-rose-200 bg-rose-50/70 text-rose-900",
      )}
    >
      <div className="flex items-center gap-2">
        {ok ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        <span className="font-medium">
          {ok
            ? `Build clean · ${after.checkedFiles} file${after.checkedFiles === 1 ? "" : "s"} compiled`
            : `${after.errors} error${after.errors === 1 ? "" : "s"} after patch`}
        </span>
        {before && (
          <span className="opacity-70">
            (was {before.errors} error{before.errors === 1 ? "" : "s"}
            {delta > 0 ? `, −${delta}` : ""})
          </span>
        )}
        {after.warnings > 0 && <span className="opacity-70">· {after.warnings} warning(s)</span>}
        {after.issues.length > 0 && (
          <Button variant="link" size="xs" onClick={() => setOpen((o) => !o)} className="ml-auto h-auto px-0">
            {open ? "Hide" : "Show"} details
          </Button>
        )}
      </div>
      {open && (
        <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-auto font-mono text-[10.5px]">
          {after.issues.map((i, idx) => (
            <li key={idx} className={i.level === "error" ? "text-rose-700" : "text-amber-700"}>
              [{i.level}] {i.path}
              {i.line ? `:${i.line}` : ""} — {i.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DiffView({ diff }: { diff: FileDiffType }) {
  const lines = useMemo(() => collapseContext(diff.lines), [diff]);
  return (
    <div className="min-w-full">
      <div className="sticky top-0 z-10 border-b border-ink-200 bg-white/95 px-3 py-1.5 font-mono text-[11px] text-ink-600 backdrop-blur">
        {diff.path} · {diff.status}
      </div>
      <table className="w-full border-collapse font-mono text-[11px]">
        <tbody>
          {lines.map((l, i) => (
            <tr
              key={i}
              className={
                l.kind === "add"
                  ? "bg-emerald-50/80"
                  : l.kind === "del"
                    ? "bg-rose-50/80"
                    : undefined
              }
            >
              <td className="w-10 select-none border-r border-ink-100 px-2 text-right align-top text-ink-400">
                {l.oldNo ?? ""}
              </td>
              <td className="w-10 select-none border-r border-ink-100 px-2 text-right align-top text-ink-400">
                {l.newNo ?? ""}
              </td>
              <td
                className={cn(
                  "w-4 select-none px-1 text-center align-top",
                  l.kind === "add" ? "text-emerald-600" : l.kind === "del" ? "text-rose-500" : "text-ink-300",
                )}
              >
                {l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}
              </td>
              <td className="whitespace-pre-wrap break-words px-2 align-top text-ink-800">{l.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
