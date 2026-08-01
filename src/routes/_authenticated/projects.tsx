import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { listThreads, type StoredThread } from "@/lib/chat-store";

export const Route = createFileRoute("/_authenticated/projects")({
  validateSearch: (search: Record<string, unknown>) => ({ filter: typeof search.filter === "string" ? search.filter : "all" }),
  component: ProjectsPage,
  head: () => ({ meta: [
    { title: "Projects — Nexura AI" }, { name: "description", content: "Browse and reopen Nexura AI workspace projects." },
    { property: "og:title", content: "Projects — Nexura AI" }, { property: "og:description", content: "Browse projects in your workspace." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

function ProjectsPage() {
  const { filter } = Route.useSearch();
  const [threads, setThreads] = useState<StoredThread[]>([]);
  useEffect(() => { void listThreads().then(setThreads); }, []);
  const title = useMemo(() => {
    if (filter === "starred") return "Starred projects";
    if (filter === "owned") return "Owned by me";
    if (filter === "shared") return "Shared with me";
    return "All projects";
  }, [filter]);
  const visible = filter === "all" || filter === "owned" ? threads : [];
  return <main className="min-h-dvh bg-ink-100 px-4 py-6 sm:px-8"><div className="mx-auto max-w-5xl"><Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" />Dashboard</Link><h1 className="mt-8 text-3xl font-semibold text-ink-900">{title}</h1><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.length ? visible.map((thread) => <Link key={thread.id} to="/workspace" search={{ thread: thread.id }} className="rounded-lg border border-ink-200 bg-white p-4 shadow-ds-xs transition hover:-translate-y-0.5"><FolderOpen className="h-5 w-5 text-[color:var(--color-iris)]" /><p className="mt-4 truncate text-sm font-semibold text-ink-900">{thread.title}</p><p className="mt-1 text-xs text-ink-500">Updated {new Date(thread.lastMessageAt).toLocaleDateString()}</p></Link>) : <p className="col-span-full rounded-lg border border-dashed border-ink-300 py-14 text-center text-sm text-ink-500">No {filter === "all" ? "projects" : filter + " projects"} yet.</p>}</div></div></main>;
}