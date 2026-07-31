import { Button } from "@/components/ui/button";
import { useState } from "react";
import { History, RotateCcw, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreview } from "./preview-context";

/** Patch version history with one-click rollback. */
export default function VersionHistory({ onClose }: { onClose: () => void }) {
  const { versions, activeVersionId, rollbackTo } = usePreview();
  const [confirming, setConfirming] = useState<string | null>(null);
  const ordered = [...versions].reverse();

  return (
    <div className="absolute right-2 top-12 z-20 w-80 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
      <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-2">
        <History className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />
        <span className="text-[11.5px] font-medium text-ink-800">Patch history</span>
        <span className="ml-auto text-[10.5px] text-ink-500">{versions.length} version(s)</span>
      </div>
      <ul className="max-h-72 overflow-auto p-1.5">
        {ordered.length === 0 && (
          <li className="px-2 py-3 text-[11px] text-ink-500">No versions yet.</li>
        )}
        {ordered.map((v) => {
          const isActive = v.id === activeVersionId;
          return (
            <li
              key={v.id}
              className={cn(
                "rounded-lg px-2 py-1.5 text-[11px]",
                isActive ? "bg-[color:var(--color-iris)]/8 ring-1 ring-[color:var(--color-iris)]/25" : "hover:bg-ink-50",
              )}
            >
              <div className="flex items-center gap-1.5">
                {isActive ? (
                  <Check className="h-3 w-3 shrink-0 text-[color:var(--color-iris)]" />
                ) : (
                  <Clock className="h-3 w-3 shrink-0 text-ink-400" />
                )}
                <span className="truncate font-medium text-ink-800">{v.label}</span>
                {!isActive && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      if (confirming === v.id) {
                        rollbackTo(v.id);
                        setConfirming(null);
                        onClose();
                      } else {
                        setConfirming(v.id);
                      }
                    }}
                    className={cn(
                      "ml-auto h-6 shrink-0 px-1.5 text-[10px]",
                      confirming === v.id && "border-primary/50 bg-primary/10 text-foreground",
                    )}
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    {confirming === v.id ? "Confirm" : "Rollback"}
                  </Button>
                )}
              </div>
              <div className="mt-0.5 pl-4.5 font-mono text-[10px] text-ink-500">
                {new Date(v.at).toLocaleTimeString()}
                {v.model ? ` · ${v.model}` : ""}
                {v.changedPaths.length ? ` · ${v.changedPaths.join(", ")}` : ""}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
