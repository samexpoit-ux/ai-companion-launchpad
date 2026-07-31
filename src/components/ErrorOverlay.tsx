import { useState } from "react";
import { AlertTriangle, Copy, RefreshCw, Wand2, X, Check } from "lucide-react";
import { usePreview } from "./preview-context";
import { Button } from "@/components/ui/button";
import { previewError, type ApiError } from "@/lib/api-error";

/**
 * In-app failure overlay. Every failure — build, runtime, /api/chat or
 * /api/autofix — is normalized to the same ApiError shape (src/lib/api-error.ts)
 * so the message, hint and next steps always render identically.
 */
export default function ErrorOverlay({ onReload }: { onReload: () => void }) {
  const {
    buildError,
    setBuildError,
    runtimeErrors,
    runAutoFix,
    clearRuntimeErrors,
    apiError,
    clearApiError,
  } = usePreview();
  const [copied, setCopied] = useState(false);

  const local = buildError ?? runtimeErrors[runtimeErrors.length - 1] ?? null;
  const err: ApiError | null = apiError ?? (local ? previewError(local) : null);
  if (!err) return null;

  const logs = runtimeErrors.slice(-6);
  const title =
    err.source === "chat"
      ? "AI request failed"
      : err.source === "autofix"
      ? "Auto-fix failed"
      : buildError
      ? "Build failed"
      : "Runtime error";

  const copy = () => {
    void navigator.clipboard.writeText(
      [`[${title}] ${err.code}`, err.message, "", ...logs].join("\n"),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const dismiss = () => {
    setBuildError(null);
    clearRuntimeErrors();
    clearApiError();
  };

  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center overflow-auto bg-ink-900/35 p-4 backdrop-blur-[2px]">
      <div className="ds-panel w-full max-w-2xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-destructive/8 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="ds-label text-destructive">{title}</span>
          <span className="ds-muted text-[11px]">{err.code}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={dismiss}
            className="ml-auto"
            aria-label="Dismiss error overlay"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <p className="ds-body">{err.hint}</p>

          <pre className="ds-code max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-destructive">
{err.message}
          </pre>

          <div>
            <div className="ds-label mb-1.5">What to do next</div>
            <ol className="ds-muted list-decimal space-y-1 pl-5">
              {err.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          {logs.length > 0 && (
            <div>
              <div className="ds-label mb-1.5">Captured logs ({logs.length})</div>
              <pre className="ds-code max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-secondary/60 p-3 text-muted-foreground">
{logs.join("\n")}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => runAutoFix()}>
              <Wand2 className="h-3.5 w-3.5" /> Fix with AI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setBuildError(null);
                clearApiError();
                onReload();
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reload preview
            </Button>
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy logs"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
