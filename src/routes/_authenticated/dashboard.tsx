import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Clock,
  Image as ImageIcon,
  LayoutDashboard,
  Mic,
  Paperclip,
  PanelLeft,
  Search,
  Store,
  Users,
  Wand2,
  Globe,
  Rocket,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth, useProfile, displayNameOf } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { queuePendingPrompt } from "@/lib/pending-prompt";
import { WorkspaceSidebar, type RecentProject } from "@/components/dashboard/WorkspaceSidebar";


export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard — Nexus X AI" },
      {
        name: "description",
        content:
          "Start a new build from a single prompt, reopen recent projects and jump into the live preview workspace.",
      },
      { property: "og:title", content: "Nexus X AI Dashboard" },
      {
        property: "og:description",
        content: "Prompt, preview and ship AI-built apps from one workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const CHIPS = [
  { label: "Website", icon: Globe },
  { label: "Community", icon: Users },
  { label: "Landing page", icon: Rocket },
  { label: "Internal tool", icon: Wand2 },
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Store", icon: Store },
] as const;

const MODES = ["Build", "Chat", "Plan"] as const;
const TABS = ["My projects", "Recently viewed", "Templates"] as const;

const THREAD_STORAGE_KEY = "nexusx.chat.v1";
const PENDING_PROMPT_KEY = "nexusx.pendingPrompt";

function readRecents(): RecentProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(THREAD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { threads?: unknown };
    if (!Array.isArray(parsed.threads)) return [];
    return parsed.threads
      .map((thread) => {
        if (typeof thread !== "object" || thread === null) return null;
        const record = thread as Record<string, unknown>;
        const id = typeof record["id"] === "string" ? record["id"] : null;
        if (!id) return null;
        const messages = Array.isArray(record["messages"]) ? record["messages"] : [];
        if (messages.length === 0) return null;
        return {
          id,
          title: typeof record["title"] === "string" ? record["title"] : "Untitled project",
          updatedAt: typeof record["updatedAt"] === "number" ? record["updatedAt"] : Date.now(),
        } satisfies RecentProject;
      })
      .filter((item): item is RecentProject => item !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function relativeTime(timestamp: number) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = useProfile(user?.id);

  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number]>("Build");
  const [modeOpen, setModeOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>("My projects");
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => setSidebarOpen(!isMobile), [isMobile]);
  useEffect(() => setRecents(readRecents()), []);


  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [prompt]);

  const firstName = useMemo(() => {
    const label = displayNameOf(profile, user);
    return label.split(/[\s@]/)[0] ?? label;
  }, [profile, user?.email]);

  const workspaceName = useMemo(
    () => `${firstName}'s workspace`,
    [firstName],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = tab === "Templates" ? [] : recents;
    if (!query) return base;
    return base.filter((project) => project.title.toLowerCase().includes(query));
  }, [recents, search, tab]);

  const launch = (text: string) => {
    const value = text.trim();
    if (!value) return;
    const token = queuePendingPrompt(value, mode);
    if (!token) return;
    setPrompt("");
    void navigate({ to: "/workspace", search: {} });
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-ink-100">
      {isMobile && sidebarOpen && (
        <div
          aria-hidden
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm"
        />
      )}

      {sidebarOpen && (
        <WorkspaceSidebar
          recents={recents}
          workspaceName={workspaceName}
          userLabel={displayNameOf(profile, user)}
          credits={{ left: 304, total: 400 }}
          onCollapse={() => setSidebarOpen(false)}
          className={cn(isMobile && "fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[300px] shadow-ds-lg")}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-b border-ink-200 bg-ink-50/90 px-3 py-2 backdrop-blur md:hidden">
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-ink-200 bg-ink-50 text-ink-500"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <span className="truncate font-display text-[13.5px] font-semibold text-ink-900">
            {workspaceName}
          </span>
        </div>

        {!sidebarOpen && !isMobile && (
          <button
            type="button"
            aria-label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
            className="absolute left-3 top-3 z-30 grid h-8 w-8 place-items-center rounded-lg border border-ink-200 bg-ink-50/90 text-ink-500 shadow-ds-sm backdrop-blur"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}


        {/* Aurora hero */}
        <section className="relative isolate flex min-h-[420px] flex-col items-center justify-center overflow-hidden px-4 py-12 sm:min-h-[520px] sm:px-5 sm:py-16 lg:rounded-bl-[28px]">
          <div className="aurora-canvas absolute inset-0 -z-10" />

          <Link
            to="/image"
            className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-3 py-1.5 text-[12.5px] font-medium text-ink-700 shadow-ds-sm backdrop-blur transition hover:bg-white"
          >
            <span className="rounded-full bg-[color:var(--color-iris)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--color-iris-fg)]">
              New
            </span>
            Image Studio now runs on smart routing
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <h1 className="mt-8 text-center font-display text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
            Got an idea, {firstName}?
          </h1>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              launch(prompt);
            }}
            className="mt-7 w-full max-w-[680px]"
          >
            <div className="rounded-[20px] bg-gradient-to-r from-[color:var(--color-iris)]/70 via-fuchsia-400/60 to-[color:var(--color-iris-warm)]/70 p-[2px] shadow-ds-lg">
              <div className="rounded-[18px] bg-ink-50 p-3">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      launch(prompt);
                    }
                  }}
                  rows={1}
                  placeholder="Ask Nexus X to build an app that…"
                  className="w-full resize-none bg-transparent px-1.5 py-1 text-[15px] text-ink-900 outline-none placeholder:text-ink-400"
                />

                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Attach a file"
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-200/70 hover:text-ink-700"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Attach an image"
                    className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-200/70 hover:text-ink-700"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>

                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setModeOpen((open) => !open)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-ink-600 transition hover:bg-ink-200/70"
                      >
                        {mode}
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {modeOpen && (
                        <div className="absolute bottom-[calc(100%+6px)] right-0 z-20 w-36 overflow-hidden rounded-xl border border-ink-200 bg-ink-50 p-1 shadow-ds-lg">
                          {MODES.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                setMode(option);
                                setModeOpen(false);
                              }}
                              className={cn(
                                "block w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] transition hover:bg-ink-200/60",
                                option === mode ? "font-semibold text-ink-900" : "text-ink-600",
                              )}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      aria-label="Dictate"
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-200/70 hover:text-ink-700"
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                    <button
                      type="submit"
                      aria-label="Start building"
                      disabled={!prompt.trim()}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--color-iris-fg)] transition disabled:opacity-40 iris-bg"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>

          <div className="mt-5 flex max-w-[720px] flex-wrap justify-center gap-2">
            {CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => setPrompt(`Build a ${chip.label.toLowerCase()} for `)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/50 bg-white/70 px-3 py-1.5 text-[12.5px] font-medium text-ink-700 shadow-ds-xs backdrop-blur transition hover:bg-white"
              >
                <chip.icon className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />
                {chip.label}
              </button>
            ))}
          </div>
        </section>

        {/* Projects panel */}
        <section className="relative -mt-6 min-h-[420px] rounded-t-[28px] border border-ink-200 bg-ink-50 px-3 py-5 shadow-ds-lg sm:px-5">
          <div className="mx-auto w-full max-w-5xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 items-center gap-2 rounded-full border border-ink-200 bg-ink-100/70 px-3 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search"
                  className="w-32 min-w-0 bg-transparent text-[12.5px] text-ink-800 outline-none placeholder:text-ink-400"
                />
              </div>
              {TABS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTab(option)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12.5px] transition",
                    option === tab
                      ? "border border-ink-200 bg-ink-50 font-semibold text-ink-900 shadow-ds-xs"
                      : "text-ink-500 hover:bg-ink-200/60 hover:text-ink-800",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="mt-8 grid place-items-center rounded-2xl border border-dashed border-ink-200 px-6 py-14 text-center">
                <p className="font-display text-[15px] font-semibold text-ink-900">
                  {tab === "Templates" ? "Templates are coming soon" : "No projects yet"}
                </p>
                <p className="mt-1 max-w-sm text-[13px] text-ink-500">
                  Describe what you want above and Nexus X will generate the files, run a live
                  preview and fix runtime errors for you.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((project) => (
                  <Link
                    key={project.id}
                    to="/workspace"
                    search={{ thread: project.id }}

                    className="group rounded-2xl border border-ink-200 bg-ink-50 p-4 shadow-ds-xs transition hover:-translate-y-0.5 hover:shadow-ds-md"
                  >
                    <div className="h-24 rounded-xl bg-gradient-to-br from-[color:var(--color-iris-soft)] via-ink-100 to-white" />
                    <p className="mt-3 truncate text-[13.5px] font-semibold text-ink-900">
                      {project.title}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-400">
                      <Clock className="h-3 w-3" />
                      Edited {relativeTime(project.updatedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
