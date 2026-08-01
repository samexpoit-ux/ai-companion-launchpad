import { useState } from "react";
import { Check, ChevronDown, Loader2, Eye, ListTree, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreview } from "@/components/preview-context";
import type { ArtifactProject } from "@/lib/artifact";
import { formatCredits } from "@/lib/credits";

export interface ActivityStep {
  label: string;
  detail?: string;
  done?: boolean;
}

/**
 * Lovable-style turn card: a one-line status header with `Details` and
 * `Preview` affordances. `Details` reveals what the model did (routing,
 * reasoning, files written); `Preview` pushes the result into the right-hand
 * live workspace.
 */
export function ActivityCard({
  title,
  steps,
  busy = false,
  project = null,
}: {
  title: string;
  steps: ActivityStep[];
  busy?: boolean;
  project?: ArtifactProject | null;
}) {
  const [open, setOpen] = useState(false);
  const { payload, openProject, openWorkspace, setTab } = usePreview();
  const canPreview = Boolean(project) || Boolean(payload);

  const showPreview = () => {
    if (project) openProject(project);
    else {
      openWorkspace();
      setTab("preview");
    }
  };

  return (
    <div
      data-testid="activity-card"
      className="not-prose mb-3 overflow-hidden rounded-2xl border border-ink-200 bg-white/80"
      style={{ boxShadow: "0 10px 30px -22px rgba(37,74,140,0.35)" }}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
            busy ? "text-[color:var(--color-iris)]" : "text-[color:var(--color-iris)]",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
          ) : (
            <Check className="h-4 w-4" strokeWidth={2.75} />
          )}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium text-ink-900",
            busy && "animate-pulse",
          )}

        >
          {title}
        </span>
      </div>

      <div className="flex items-center gap-2 border-t border-ink-200/70 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 transition hover:border-ink-300 hover:text-ink-900"
        >
          <ListTree className="h-3.5 w-3.5" />
          Details
          <ChevronDown className={cn("h-3.5 w-3.5 text-ink-400 transition-transform", open && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={showPreview}
          disabled={!canPreview}
          className={cn(
            "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition",
            canPreview
              ? "border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/10 text-ink-900 hover:brightness-105"
              : "cursor-not-allowed border-ink-200 bg-ink-100 text-ink-400",
          )}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
      </div>

      {open && (
        <ol className="border-t border-ink-200/70 bg-ink-100/50 px-3.5 py-3 text-xs">
          {steps.length === 0 && <li className="text-ink-500">No activity recorded for this turn.</li>}
          {steps.map((s, i) => (
            <li key={`${s.label}-${i}`} className="flex gap-2 py-1">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-iris)]/70" />
              <span className="min-w-0">
                <span className="font-medium text-ink-800">{s.label}</span>
                {s.detail && (
                  <span className="ml-1.5 break-words font-mono text-2xs text-ink-500">{s.detail}</span>
                )}
              </span>
            </li>
          ))}
          {project && (
            <li className="mt-2 border-t border-ink-200/70 pt-2">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-ink-800">
                <FileCode2 className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />
                {project.order.length} file{project.order.length > 1 ? "s" : ""}
              </div>
              <ul className="max-h-36 overflow-auto">
                {project.order.map((p) => (
                  <li key={p} className="truncate font-mono text-2xs leading-5 text-ink-600">
                    {p}
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

/** Builds the Details timeline for a completed assistant turn. */
export function stepsForMessage(opts: {
  modelName?: string;
  latencyMs?: number;
  tokens?: number;
  credits?: number;
  fileCount?: number;
}): ActivityStep[] {
  const steps: ActivityStep[] = [
    { label: "Analysed the prompt", detail: "smart cost router", done: true },
  ];
  if (opts.modelName) steps.push({ label: "Routed to model", detail: opts.modelName, done: true });
  steps.push({
    label: "Generated the response",
    detail: [
      opts.latencyMs ? `${(opts.latencyMs / 1000).toFixed(2)}s` : null,
      opts.tokens ? `${opts.tokens} tokens` : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
    done: true,
  });
  if (opts.fileCount) {
    steps.push({ label: "Wrote project files", detail: `${opts.fileCount} files`, done: true });
  }
  if (opts.credits != null) {
    steps.push({ label: "Charged credits", detail: `${formatCredits(opts.credits)} credits`, done: true });
  }
  return steps;
}
