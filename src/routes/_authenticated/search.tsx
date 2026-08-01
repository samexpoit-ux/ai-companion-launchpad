import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { listThreads, type StoredThread } from "@/lib/chat-store";

export const Route = createFileRoute("/_authenticated/search")({
  component: SearchPage,
  head: () => ({ meta: [
    { title: "Search projects — Nexura AI" },
    { name: "description", content: "Search your Nexura AI projects and conversations." },
    { property: "og:title", content: "Search projects — Nexura AI" },
    { property: "og:description", content: "Search projects and conversations in your workspace." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

function SearchPage() {
  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState<StoredThread[]>([]);
  useEffect(() => { void listThreads().then(setThreads); }, []);
  const results = useMemo(() => threads.filter((thread) => thread.title.toLowerCase().includes(query.toLowerCase())), [query, threads]);
  return <main className="min-h-dvh bg-ink-100 px-4 py-6 sm:px-8"><div className="mx-auto max-w-3xl">
    <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
    <h1 className="mt-8 text-3xl font-semibold text-ink-900">Search</h1>
    <label className="mt-6 flex items-center gap-3 rounded-lg border border-ink-200 bg-white px-4 shadow-ds-xs"><Search className="h-4 w-4 text-ink-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects and conversations" className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
    <div className="mt-5 divide-y divide-ink-200 rounded-lg border border-ink-200 bg-white">{results.length ? results.map((thread) => <Link key={thread.id} to="/workspace" search={{ thread: thread.id }} className="block px-4 py-3 text-sm font-medium text-ink-800 hover:bg-ink-100">{thread.title}</Link>) : <p className="px-4 py-10 text-center text-sm text-ink-500">{query ? "No matching projects" : "No projects yet"}</p>}</div>
  </div></main>;
}