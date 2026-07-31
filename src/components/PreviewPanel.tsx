import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { spendAction } from "@/lib/api-fetch";
import { X, Code2, Eye, Terminal, RefreshCw, Monitor, Tablet, Smartphone, Wand2, Loader2, ShieldCheck, AlertTriangle, History, GitCompare, Play, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCredits } from "@/hooks/useCredits";
import { CreditMeter } from "@/components/CreditMeter";
import { estimateCost, formatCredits } from "@/lib/credits";
import { usePreview, MAX_FIX_ATTEMPTS, type PreviewPayload, type PreviewDevice } from "./preview-context";

// Sandpack touches window at import; keep it out of the SSR graph.
const SandpackStage = lazy(() => import("./SandpackStage"));
// Offline-first renderer for the Preview tab (no remote bundler needed).
const LocalPreview = lazy(() => import("./LocalPreview"));
// Multi-file artifact explorer (file tree + inline editor).
const ProjectExplorer = lazy(() => import("./ProjectExplorer"));
// Diff review gate + patch history + lint/build validation (Babel is client-only).
const PatchReview = lazy(() => import("./PatchReview"));
const VersionHistory = lazy(() => import("./VersionHistory"));
const ValidationBadge = lazy(() => import("./ValidationBadge"));
// Build/runtime failure overlay with logs + next steps.
const ErrorOverlay = lazy(() => import("./ErrorOverlay"));




export function PreviewPanel() {
  const {
    isOpen,
    payload,
    closePreview,
    tab,
    setTab,
    device,
    setDevice,
    revision,
    runtimeErrors,
    autoFixEnabled,
    setAutoFixEnabled,
    fixStatus,
    fixAttempts,
    fixLog,
    fixError,
    runAutoFix,
    resetAutoFix,
    reviewBeforeApply,
    setReviewBeforeApply,
    pendingPatch,
    versions,
    buildError,
  } = usePreview();

  const [reloadKey, setReloadKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { loadStarterProject } = usePreview();
  const credits = useCredits();

  // Safe run flow: nothing executes in the sandbox until the user explicitly
  // arms this revision. A new AI patch (new revision) re-locks the preview.
  const [armedRevision, setArmedRevision] = useState<number | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const armed = armedRevision === revision;
  const runCost = estimateCost("preview_run");

  useEffect(() => {
    setRunError(null);
  }, [revision]);

  const runPreview = useCallback(async () => {
    if (!credits.canAfford("preview_run")) {
      setRunError("Not enough credits to run the preview.");
      return;
    }
    try {
      const balance = await spendAction("preview_run");
      credits.applyServerBalance(balance);
      setArmedRevision(revision);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Could not start the preview. Try again.");
    }
  }, [credits, revision]);

  const chargedAutoFix = useCallback(async () => {
    if (!credits.canAfford("autofix")) {
      setRunError("Not enough credits for an auto-fix attempt.");
      return;
    }
    // The /api/autofix route charges the account server-side; refresh after.
    runAutoFix();
    void credits.refresh();
  }, [credits, runAutoFix]);

  if (!isOpen) return null;
  if (!payload) return <EmptyWorkspace onClose={closePreview} onStart={loadStarterProject} />;


  return (
    <aside className="relative flex h-full min-w-0 flex-col border-l border-ink-200 bg-ink-100">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-white px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Live Workspace</span>
        <span className="rounded-md border border-ink-200 bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
          {payload.files ? `${Object.keys(payload.files).length} files` : payload.lang}
        </span>


        <div className="flex items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-100 p-0.5">

          <TabBtn active={tab === "preview"} onClick={() => setTab("preview")} icon={Eye} label="Preview" />
          <TabBtn active={tab === "code"} onClick={() => setTab("code")} icon={Code2} label="Code" />
          <TabBtn active={tab === "console"} onClick={() => setTab("console")} icon={Terminal} label="Console" />
        </div>

        {tab === "preview" && (
          <div className="flex items-center gap-0.5 rounded-lg border border-ink-200 bg-ink-100 p-0.5">
            <DeviceBtn active={device === "desktop"} onClick={() => setDevice("desktop")} icon={Monitor} label="Desktop" />
            <DeviceBtn active={device === "tablet"} onClick={() => setDevice("tablet")} icon={Tablet} label="Tablet" />
            <DeviceBtn active={device === "mobile"} onClick={() => setDevice("mobile")} icon={Smartphone} label="Mobile" />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <CreditMeter
            plan={credits.plan}
            remaining={credits.remaining}
            total={credits.total}
            compact
            className="hidden px-2 py-1 md:block"
          />
          <Suspense fallback={null}>
            <ValidationBadge />
          </Suspense>
          <button
            onClick={() => setReviewBeforeApply(!reviewBeforeApply)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] transition",
              reviewBeforeApply
                ? "border-[color:var(--color-iris)]/40 bg-[color:var(--color-iris)]/10 text-ink-800"
                : "border-ink-200 bg-white/60 text-ink-500 hover:text-ink-800",
            )}
            title="Review the diff of every AI patch before it is applied"
          >
            <GitCompare className="h-3 w-3" />
            Review {reviewBeforeApply ? "on" : "off"}
          </button>
          <button
            onClick={() => setAutoFixEnabled(!autoFixEnabled)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] transition",
              autoFixEnabled
                ? "border-[color:var(--color-iris)]/40 bg-[color:var(--color-iris)]/10 text-ink-800"
                : "border-ink-200 bg-white/60 text-ink-500 hover:text-ink-800",
            )}
            title="Auto bug-fix: capture sandbox console errors and patch the code with AI"
          >
            <Wand2 className="h-3 w-3" />
            Auto-fix {autoFixEnabled ? "on" : "off"}
          </button>
          <button
            onClick={() => setHistoryOpen((h) => !h)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md p-1.5 transition",
              historyOpen ? "bg-ink-900/5 text-ink-900" : "text-ink-500 hover:bg-ink-900/5 hover:text-ink-900",
            )}
            aria-label="Patch history"
            title="Patch history & rollback"
          >
            <History className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px]">{versions.length}</span>
          </button>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-md p-1.5 text-ink-500 hover:bg-ink-900/5 hover:text-ink-900"
            aria-label="Reload preview"
            title="Reload"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={closePreview}
            className="rounded-md p-1.5 text-ink-500 hover:bg-ink-900/5 hover:text-ink-900"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {historyOpen && (
        <Suspense fallback={null}>
          <VersionHistory onClose={() => setHistoryOpen(false)} />
        </Suspense>
      )}

      <AutoFixBar
        status={fixStatus}
        attempts={fixAttempts}
        errors={runtimeErrors}
        log={fixLog}
        error={fixError}
        onFix={() => void chargedAutoFix()}
        onReset={resetAutoFix}
      />

      {/* Sandpack */}
      <div className="relative flex-1 overflow-hidden">
        <Suspense fallback={<LoadingSkeleton />}>
          {tab === "preview" ? (
            armed ? (
              <LocalPreview
                key={`local-${payload.lang}-${revision}`}
                payload={payload}
                device={device}
                reloadKey={reloadKey}
              />
            ) : (
              <RunGate
                cost={runCost}
                remaining={credits.remaining}
                affordable={credits.canAfford("preview_run")}
                error={runError}
                fileCount={payload.files ? Object.keys(payload.files).length : 1}
                onRun={() => void runPreview()}
              />
            )
          ) : tab === "code" && payload.files ? (
            <ProjectExplorer key={`explorer-${revision}`} />
          ) : (
            <SandpackStage
              key={`${payload.lang}-${reloadKey}-${revision}`}
              payload={payload}
              tab={tab}
              device={device}
            />
          )}
        </Suspense>

        {buildError && !pendingPatch && (
          <Suspense fallback={null}>
            <ErrorOverlay onReload={() => setReloadKey((k) => k + 1)} />
          </Suspense>
        )}

        {pendingPatch && (
          <Suspense fallback={null}>
            <PatchReview />
          </Suspense>
        )}

      </div>

    </aside>
  );
}

/** Explicit, sandboxed run gate with the cost shown before execution. */
function RunGate({
  cost,
  remaining,
  affordable,
  error,
  fileCount,
  onRun,
}: {
  cost: number;
  remaining: number;
  affordable: boolean;
  error: string | null;
  fileCount: number;
  onRun: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm rounded-2xl border border-ink-200 bg-white p-5 text-center shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)]">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-ink-200 bg-ink-100">
          <Lock className="h-4 w-4 text-ink-500" />
        </span>
        <h3 className="mt-3 text-sm font-semibold text-ink-900">Preview is ready to run</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
          {fileCount} file{fileCount === 1 ? "" : "s"} will run in an isolated sandbox iframe — no network access to your
          account, no code executed until you press run.
        </p>
        <div className="mt-3 rounded-lg border border-ink-200 bg-ink-100 px-3 py-2 text-[11px] text-ink-600">
          Cost <span className="font-semibold text-ink-900">{formatCredits(cost)}</span> credits ·{" "}
          <span className="font-semibold text-ink-900">{formatCredits(remaining)}</span> left now ·{" "}
          <span className="font-semibold text-ink-900">{formatCredits(Math.max(0, remaining - cost))}</span> after
        </div>
        <button
          onClick={onRun}
          disabled={!affordable}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-45"
        >
          <Play className="h-3.5 w-3.5" />
          Run preview
        </button>
        {!affordable && (
          <p className="mt-2 text-[10.5px] text-red-500">Not enough credits — upgrade your plan to keep building.</p>
        )}
        {error && <p className="mt-2 text-[10.5px] text-red-500">{error}</p>}
      </div>
    </div>
  );
}

function AutoFixBar({
  status,
  attempts,
  errors,
  log,
  error,
  onFix,
  onReset,
}: {
  status: string;
  attempts: number;
  errors: string[];
  log: Array<{ attempt: number; summary: string; model?: string; ok: boolean }>;
  error: string | null;
  onFix: () => void;
  onReset: () => void;
}) {
  if (status === "idle" && errors.length === 0) return null;

  const last = log[log.length - 1];

  const tone =
    status === "review"
      ? "border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/10 text-ink-800"
      : status === "fixed"
      ? "border-emerald-300/60 bg-emerald-50/80 text-emerald-900"
      : status === "failed" || status === "exhausted"
        ? "border-sky-300/70 bg-sky-50/80 text-sky-900"
        : "border-[color:var(--color-iris)]/35 bg-[color:var(--color-iris)]/8 text-ink-800";

  return (
    <div className={cn("flex items-start gap-2 border-b px-3 py-2 text-[11px]", tone)}>
      <span className="mt-0.5 shrink-0">
        {status === "fixing" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : status === "fixed" ? (
          <ShieldCheck className="h-3.5 w-3.5" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {status === "fixing" && `Auto-fixing… attempt ${attempts} of ${MAX_FIX_ATTEMPTS}`}
          {status === "review" && `Patch ready for review — attempt ${attempts}`}
          {status === "detected" && `${errors.length} runtime error${errors.length > 1 ? "s" : ""} captured`}
          {status === "fixed" && (last?.summary ?? "Patch applied")}
          {status === "failed" && (error ?? "Auto-fix failed")}
          {status === "exhausted" && `Still failing after ${MAX_FIX_ATTEMPTS} AI attempts`}
        </div>
        {errors.length > 0 && (
          <pre className="mt-1 max-h-16 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] opacity-80">
{errors.slice(-2).join("\n")}
          </pre>
        )}
        {status === "fixed" && last?.model && (
          <div className="mt-0.5 font-mono text-[10px] opacity-70">
            patched by {last.model} · attempt {last.attempt}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {(status === "detected" || status === "failed" || status === "exhausted") && errors.length > 0 && (
          <button
            onClick={onFix}
            className="inline-flex items-center gap-1 rounded-md border border-current/25 bg-white/70 px-2 py-1 text-[10.5px] hover:bg-white/90"
          >
            <Wand2 className="h-3 w-3" />
            Fix with AI
          </button>
        )}
        <button
          onClick={onReset}
          className="rounded-md p-1 opacity-60 hover:opacity-100"
          aria-label="Dismiss auto-fix status"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Eye;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition",
        active
          ? "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200"
          : "text-ink-500 hover:text-ink-900",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

function DeviceBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Monitor;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${label} viewport`}
      aria-pressed={active}
      title={label}
      className={cn(
        "rounded-md p-1.5 transition",
        active
          ? "bg-white/80 text-[color:var(--color-iris-ink)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-iris)_35%,transparent)]"
          : "text-ink-500 hover:text-ink-900",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function EmptyWorkspace({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  return (
    <aside className="relative flex h-full min-w-0 flex-col border-l border-ink-200 bg-ink-100">
      <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">Live Workspace</span>
        <span className="rounded-md border border-ink-200 bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">idle</span>
        <button
          onClick={onClose}
          className="ml-auto rounded-md p-1.5 text-ink-500 hover:bg-ink-900/5 hover:text-ink-900"
          aria-label="Close preview"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid flex-1 place-items-center px-6 text-center">
        <div className="max-w-xs">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-ink-200 bg-white shadow-sm">
            <Eye className="h-5 w-5 text-[color:var(--color-iris)]" />
          </div>
          <p className="text-sm font-medium text-ink-900">Nothing to preview yet</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">
            Ask Nexura to build something — generated projects open here with live
            preview, a file explorer and console.
          </p>
          <button
            onClick={onStart}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--color-iris)]/40 bg-white px-3 py-1.5 text-[12px] font-medium text-ink-800 shadow-sm transition hover:bg-[color:var(--color-iris)]/10"
          >
            <Code2 className="h-3.5 w-3.5" />
            Load starter project
          </button>
        </div>
      </div>
    </aside>
  );
}

function LoadingSkeleton() {

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 text-[11px] text-ink-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--color-iris)]" />
        Booting live workspace…
      </div>
    </div>
  );
}

export type { PreviewPayload, PreviewDevice };
