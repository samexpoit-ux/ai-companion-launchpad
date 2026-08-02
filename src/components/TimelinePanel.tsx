import { useState } from "react";
import { ArrowLeft, Clock, FileCode2, GitCompare, Lightbulb, SquareDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreview, type TimelineView } from "@/components/preview-context";

/**
 * Right-hand "Details" surface, the way Lovable shows it: the trajectory of the
 * selected turn (thinking → steps → credits → files) with a `Back to latest`
 * button that returns to the live preview / code / console.
 */
export function TimelinePanel({ view }: { view: TimelineView }) {
  const { backToLatest } = usePreview();
  const [pane, setPane] = useState<"timeline" | "changes">("timeline");

  const seconds = view.durationMs ? Math.max(1, Math.round(view.durationMs / 1000)) : null;

  return (
    <aside
      data-testid="details-timeline"
      className="relative flex h-full min-w-0 flex-col border-l border-ink-200 bg-ink-100"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-200 bg-white px-2 sm:px-3">
        <button
          type="button"
          onClick={backToLatest}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700 transition hover:border-ink-300 hover:text-ink-900 active:scale-95"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to latest
        </button>
        {seconds != null && (
          <span className="hidden items-center gap-1 text-2xs text-ink-500 sm:inline-flex">
            <Clock className="h-3 w-3" />
            {seconds}s
          </span>
        )}
        <span className="mx-auto hidden truncate text-xs font-semibold text-ink-900 md:block">
          Details
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full border border-ink-200 bg-ink-100 p-0.5">
          <PaneBtn
            active={pane === "timeline"}
            onClick={() => setPane("timeline")}
            label="Timeline"
            icon={SquareDashed}
          />
          <PaneBtn
            active={pane === "changes"}
            onClick={() => setPane("changes")}
            label="Changes"
            icon={GitCompare}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="rounded-2xl border border-ink-200 bg-white p-3">
          {pane === "timeline" ? (
            <ol className="relative space-y-0">
              <li className="flex gap-3 pb-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[color:var(--color-iris)]">
                  <Lightbulb className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 text-sm font-medium text-ink-900">
                  {seconds != null ? `Thought for ${seconds}s` : "Thought about your request"}
                </span>
              </li>
              {view.steps.map((step, index) => (
                <li
                  key={`${step.label}-${index}`}
                  className="flex gap-3 border-t border-ink-200/70 py-3"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-ink-200 text-2xs text-ink-500">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-900">{step.label}</span>
                    {step.detail && (
                      <span className="mt-0.5 block break-words font-mono text-2xs text-ink-500">
                        {step.detail}
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {view.charge && view.charge.length > 0 && (
                <li className="border-t border-ink-200/70 pt-3">
                  <div className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.16em] text-ink-400">
                    Credits used and why
                  </div>
                  <ul className="space-y-1 text-xs">
                    {view.charge.map((line) => (
                      <li key={line.label} className="flex gap-2">
                        <span className="shrink-0 text-ink-700">{line.label}</span>
                        <span className="min-w-0 break-words text-ink-500">{line.detail}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </ol>
          ) : view.files.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-500">
              This turn did not change any files.
            </p>
          ) : (
            <ul className="space-y-1">
              {view.files.map((path) => (
                <li
                  key={path}
                  className="flex items-center gap-2 rounded-lg border border-ink-200/70 px-2.5 py-2 font-mono text-2xs text-ink-700"
                >
                  <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-iris)]" />
                  <span className="truncate">{path}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

function PaneBtn({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: typeof GitCompare;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-2xs font-semibold transition",
        active
          ? "bg-white text-ink-900 shadow-ds-sm"
          : "text-ink-500 hover:text-ink-800",
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

export default TimelinePanel;
