import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";

export const Route = createFileRoute("/_authenticated/workspace")({
  component: WorkspacePage,
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    ...(typeof search["thread"] === "string" && search["thread"]
      ? { thread: search["thread"] }
      : {}),
  }),

  head: () => ({
    meta: [
      { title: "Workspace — Nexura AI" },
      {
        name: "description",
        content:
          "Your Nexura AI workspace: smart model routing, multi-file artifacts, live preview and automatic bug fixing.",
      },
      { property: "og:title", content: "Nexura AI Workspace" },
      {
        property: "og:description",
        content: "Build, preview and auto-fix projects with Nexura AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function WorkspacePage() {
  const [Workspace, setWorkspace] = useState<ComponentType | null>(null);

  useEffect(() => {
    let mounted = true;
    import("@/components/ChatWorkspace").then((mod) => {
      if (mounted) setWorkspace(() => mod.ChatWorkspace);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!Workspace) return <WorkspaceBootScreen />;
  return <Workspace />;
}

function WorkspaceBootScreen() {
  return (
    <main
      className="grid min-h-dvh place-items-center px-4 text-ink-800"
      style={{
        background:
          "linear-gradient(135deg, #FFFFFF 0%, #FAFBFC 40%, #EEF3FA 72%, #FFFFFF 100%)",
      }}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-ink-200/70 bg-white/70 px-4 py-3 shadow-[0_30px_80px_-40px_rgba(37,74,140,0.35)] backdrop-blur">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[color:var(--color-iris-cyan)]" />
        <span className="text-xs uppercase tracking-[0.22em] text-ink-500">
          Booting Nexura AI
        </span>
      </div>
    </main>
  );
}
