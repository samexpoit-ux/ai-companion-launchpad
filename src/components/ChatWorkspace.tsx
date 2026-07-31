import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseApiError } from "@/lib/api-error";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useProfile, displayNameOf } from "@/hooks/useAuth";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Plus,
  Settings,
  LogOut,
  ArrowUp,
  Paperclip,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Pencil,
  Check,
  X,
  Copy,
  Menu,
  Search,
  ChevronDown,
  Command,
  Zap,
  Shield,
  Sparkle,
  Diamond,
  Mic,
  Image as ImageIcon,
  ChevronRight,
  Crown,
} from "lucide-react";
import {
  sendChatMessage,
  AI_MODELS,
  type ChatMessage,
  type ChatThread,
  type AIModel,
} from "@/lib/chat-api";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import nexusLogo from "@/assets/nexus-x-logo.png";
import { ThemePicker } from "@/components/ThemePicker";
import { Link, useRouterState } from "@tanstack/react-router";
import { takePendingPrompt } from "@/lib/pending-prompt";

import { PreviewProvider, usePreview, isPreviewable } from "@/components/preview-context";
import { PreviewPanel } from "@/components/PreviewPanel";
import { PlayCircle, GripVertical, FolderTree, PanelRight } from "lucide-react";
import { hasArtifact, parseArtifacts, stripArtifacts, type ArtifactProject } from "@/lib/artifact";

import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";



const uid = () => Math.random().toString(36).slice(2, 10);
const STORAGE_KEY = "nexusx.chat.v1";

type Persisted = { threads: ChatThread[]; activeId: string; modelId: string };

const createFreshThread = (): ChatThread => ({
  id: uid(),
  title: "Untitled dossier",
  messages: [],
  updatedAt: Date.now(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const role = value.role === "user" || value.role === "assistant" ? value.role : null;
  const content = typeof value.content === "string" ? value.content : null;
  if (!role || content === null) return null;
  return {
    id: typeof value.id === "string" && value.id ? value.id : uid(),
    role,
    content,
    createdAt: finiteNumber(value.createdAt, Date.now()),
    model: typeof value.model === "string" ? value.model : undefined,
    tokens: typeof value.tokens === "number" && Number.isFinite(value.tokens) ? value.tokens : undefined,
    latencyMs: typeof value.latencyMs === "number" && Number.isFinite(value.latencyMs) ? value.latencyMs : undefined,
  };
}

function normalizeThread(value: unknown): ChatThread | null {
  if (!isRecord(value)) return null;
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeMessage).filter((m): m is ChatMessage => Boolean(m))
    : [];
  const fallbackTitle = messages.find((m) => m.role === "user")?.content.slice(0, 48) || "Untitled dossier";
  const latestMessageAt = messages.reduce((latest, m) => Math.max(latest, m.createdAt), 0);
  return {
    id: typeof value.id === "string" && value.id ? value.id : uid(),
    title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : fallbackTitle,
    messages,
    updatedAt: finiteNumber(value.updatedAt, latestMessageAt || Date.now()),
    model: typeof value.model === "string" ? value.model : undefined,
  };
}

function normalizePersisted(value: unknown): Persisted | null {
  if (!isRecord(value)) return null;
  const threads = Array.isArray(value.threads)
    ? value.threads.map(normalizeThread).filter((t): t is ChatThread => Boolean(t))
    : [];
  const safeThreads = threads.length > 0 ? threads : [createFreshThread()];
  const activeId =
    typeof value.activeId === "string" && safeThreads.some((t) => t.id === value.activeId)
      ? value.activeId
      : safeThreads[0].id;
  const modelId =
    typeof value.modelId === "string" && AI_MODELS.some((m) => m.id === value.modelId)
      ? value.modelId
      : AI_MODELS[0].id;
  return { threads: safeThreads, activeId, modelId };
}

function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizePersisted(JSON.parse(raw));
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

const tierIcon = (tier: AIModel["tier"]) =>
  tier === "Signature" ? Crown : tier === "Reserve" ? Diamond : Sparkle;

export function ChatWorkspace() {
  return (
    <PreviewProvider>
      <ChatWorkspaceInner />
    </PreviewProvider>
  );
}

function ChatWorkspaceInner() {
  const [hydrated, setHydrated] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [modelId, setModelId] = useState<string>(AI_MODELS[0].id);
  
  const { isOpen: previewOpen, toggleWorkspace } = usePreview();
  const isMobile = useIsMobile();

  // Deep link: /workspace?thread=<id> opens that conversation.
  const requestedThreadId = useRouterState({
    select: (state) => {
      const search = state.location.search as Record<string, unknown> | undefined;
      const value = search?.["thread"];
      return typeof value === "string" && value ? value : null;
    },
  });


  const { user } = useAuth();
  const profile = useProfile(user?.id);
  const accountName = displayNameOf(profile, user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };


  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [query, setQuery] = useState("");
  useEffect(() => setSidebarOpen(!isMobile), [isMobile]);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const persisted = loadPersisted();
    if (persisted && persisted.threads.length > 0) {
      setThreads(persisted.threads);
      setActiveId(
        requestedThreadId && persisted.threads.some((t) => t.id === requestedThreadId)
          ? requestedThreadId
          : persisted.activeId,
      );
      setModelId(persisted.modelId);
    } else {
      const first = createFreshThread();
      setThreads([first]);
      setActiveId(first.id);
    }
    setHydrated(true);
    // Only run once on mount; the deep link is read from the initial URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow ?thread= deep links after the initial hydration too.
  useEffect(() => {
    if (!hydrated || !requestedThreadId) return;
    setThreads((prev) => {
      if (prev.some((t) => t.id === requestedThreadId)) setActiveId(requestedThreadId);
      return prev;
    });
  }, [hydrated, requestedThreadId]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ threads, activeId, modelId }));
    } catch {
      /* ignore */
    }
  }, [threads, activeId, modelId, hydrated]);


  const active = useMemo(
    () => threads.find((t) => t.id === activeId) ?? threads[0],
    [threads, activeId],
  );
  const model = useMemo(
    () => AI_MODELS.find((m) => m.id === modelId) ?? AI_MODELS[0],
    [modelId],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return threads;
    const q = query.toLowerCase();
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, query]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, isSending]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const newChat = () => {
    if (active && active.messages.length === 0) {
      setInput("");
      return;
    }
    const t: ChatThread = { id: uid(), title: "Untitled dossier", messages: [], updatedAt: Date.now() };
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
    setInput("");
  };

  const deleteThread = (id: string) => {
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh: ChatThread = { id: uid(), title: "Untitled dossier", messages: [], updatedAt: Date.now() };
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  const startRename = (t: ChatThread) => {
    setRenamingId(t.id);
    setRenameDraft(t.title);
  };
  const commitRename = () => {
    const id = renamingId;
    const title = renameDraft.trim();
    if (id && title) {
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    }
    setRenamingId(null);
    setRenameDraft("");
  };
  const cancelRename = () => {
    setRenamingId(null);
    setRenameDraft("");
  };

  const updateThread = useCallback((id: string, updater: (t: ChatThread) => ChatThread) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? updater(t) : t)));
  }, []);

  const sendText = useCallback(
    async (text: string, thread: ChatThread) => {
      const value = text.trim();
      if (!value) return;
      const userMsg: ChatMessage = { id: uid(), role: "user", content: value, createdAt: Date.now() };
      const isFirst = thread.messages.length === 0;
      updateThread(thread.id, (t) => ({
        ...t,
        title: isFirst ? value.slice(0, 48) : t.title,
        messages: [...t.messages, userMsg],
        updatedAt: Date.now(),
      }));
      setIsSending(true);
      try {
        const reply = await sendChatMessage([...(thread.messages ?? []), userMsg], modelId);
        const asstMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: reply.content,
          model: reply.model,
          tokens: reply.tokens,
          latencyMs: reply.latencyMs,
          createdAt: Date.now(),
        };
        updateThread(thread.id, (t) => ({
          ...t,
          messages: [...t.messages, asstMsg],
          updatedAt: Date.now(),
        }));
      } catch (error) {
        const apiErr = parseApiError(error, "chat");
        const steps = apiErr.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
        const asstMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: `**${apiErr.hint}**\n\n\`${apiErr.code}\` — ${apiErr.message}\n\n**What to do next**\n\n${steps}`,
          model: modelId,
          createdAt: Date.now(),
        };
        updateThread(thread.id, (t) => ({
          ...t,
          messages: [...t.messages, asstMsg],
          updatedAt: Date.now(),
        }));
      } finally {
        setIsSending(false);
      }
    },
    [modelId, updateThread],
  );

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending || !active) return;
    setInput("");
    await sendText(text, active);
  };

  // Prompt handed off from the dashboard hero: consumed exactly once, and always
  // delivered into an empty thread so it never lands mid-conversation.
  const handoffDone = useRef(false);
  useEffect(() => {
    if (!hydrated || handoffDone.current) return;
    handoffDone.current = true;
    const pending = takePendingPrompt();
    if (!pending) return;

    const current = threads.find((t) => t.id === activeId);
    if (current && current.messages.length === 0) {
      setInput("");
      void sendText(pending.prompt, current);
      return;
    }
    const fresh: ChatThread = {
      id: uid(),
      title: pending.prompt.slice(0, 48),
      messages: [],
      updatedAt: Date.now(),
    };
    setThreads((prev) => [fresh, ...prev]);
    setActiveId(fresh.id);
    setInput("");
    void sendText(pending.prompt, fresh);
  }, [hydrated, threads, activeId, sendText]);


  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const totalTokens = active?.messages.reduce((s, m) => s + (m.tokens ?? Math.round(m.content.length / 3.6)), 0) ?? 0;

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-white text-ink-900">



      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-ink-900/20 backdrop-blur-sm md:hidden"
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "flex h-full w-64 shrink-0 flex-col border-r border-ink-200 bg-ink-100 transition-transform duration-300",
          "fixed inset-y-0 left-0 z-40 md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:w-0 md:-translate-x-0 md:overflow-hidden md:border-0",
        )}
      >

        {/* Brand */}
        <div className="flex items-center gap-2.5 border-b border-ink-200 px-4 py-4">
          <div className="relative flex h-9 w-9 items-center justify-center">
            <img
              src={nexusLogo}
              alt="Nexus X AI logo"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="font-display text-[15px] font-bold leading-tight tracking-tight text-ink-900">
              Nexus <span className="text-[color:var(--color-iris)]">X AI</span>
            </div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
              Free Intelligence Network
            </div>
          </div>
        </div>

        {/* New chat + search */}
        <div className="flex flex-col gap-3 border-b border-ink-200 p-4">
          <Button onClick={newChat} className="w-full rounded-xl font-display font-semibold active:scale-[0.99]">
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            New Workspace
          </Button>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">Recent sessions</span>
          <span className="text-[10px] text-ink-400">{filtered.length}</span>
        </div>


        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {filtered.map((t) => {
            const isRenaming = renamingId === t.id;
            const isActive = t.id === activeId;
            return (
              <div
                key={t.id}
                className={cn(
                  "group relative mb-0.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition",
                  isActive
                    ? "border-ink-200 bg-[color:var(--color-iris-soft)]/60 font-medium text-ink-900"
                    : "border-transparent text-ink-700 hover:bg-[color:var(--color-iris-soft)]/30 hover:text-ink-900",
                )}
              >


                {isRenaming ? (
                  <>
                    <Input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="h-7 flex-1 px-1.5 text-[13px]"
                    />
                    <Button variant="ghost" size="icon-sm" onClick={commitRename} className="text-primary" aria-label="Save name"><Check className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={cancelRename} aria-label="Cancel rename"><X className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setActiveId(t.id);
                        if (isMobile) setSidebarOpen(false);
                      }}
                      onDoubleClick={() => startRename(t)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate">{t.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-500">
                        <span>{new Date(t.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                        <span className="text-ink-300">·</span>
                        <span>{t.messages.length} turns</span>
                      </div>
                    </button>
                    <div className="flex items-center opacity-0 transition group-hover:opacity-100">
                      <Button variant="ghost" size="icon-sm" onClick={() => startRename(t)} aria-label="Rename">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => deleteThread(t.id)} className="hover:text-destructive" aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* User */}
        <div className="border-t border-ink-200 p-3">
          <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white/60 p-2.5">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full p-[1.5px]" style={{
              background: "var(--iris-gradient)",
            }}>
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white">
                <span className="font-display text-base font-semibold text-[color:var(--color-iris)]">
                  {accountName.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-1 ring-white" style={{ background: "var(--iris-gradient)" }}>
                <Crown className="h-2 w-2 text-white" />
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <div className="truncate text-[13px] font-medium">{accountName}</div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="rounded-sm bg-[color:var(--color-iris)]/15 px-1 py-px font-medium uppercase text-[color:var(--color-iris)]">
                  {profile?.plan ?? "free"}
                </span>
                <span className="truncate text-ink-500">{user?.email ?? ""}</span>
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Settings">
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Log out" onClick={handleSignOut}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>

        </div>

        {/* Developer credit */}
        <div className="border-t border-ink-200 px-4 py-3 text-center">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-ink-400">
            Crafted with care
          </div>
          <div className="mt-0.5 text-[12.5px] font-medium text-ink-700">
            Developed by <span className="font-semibold text-[color:var(--color-iris)]">Sam</span>
          </div>
        </div>

      </aside>

      {/* Main + Live workspace (resizable split) */}
      <PanelGroup orientation="horizontal" className="flex h-full min-w-0 flex-1">
      <Panel id="chat" minSize="26%" className="flex min-w-0 flex-col">
      <main className="relative flex h-full min-w-0 flex-1 flex-col">

        {/* Header */}
        <header className="relative z-10 flex h-14 items-center gap-2 border-b border-ink-200 bg-white px-3 sm:gap-3 sm:px-6">


          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarOpen((v) => !v)}
            className="shrink-0"
            aria-label="Toggle sidebar"
          >
            {isMobile ? <Menu className="h-4 w-4" /> : sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </Button>

          {/* Smart auto-router — no model picker, Lovable style */}
          <div
            className="flex min-w-0 items-center gap-1.5 rounded-full border border-ink-200 bg-ink-100 px-2.5 py-1"
            title="Nexus X automatically picks the best-value model for each request"
          >
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[color:var(--color-iris)]" />
            <span className="truncate text-[11.5px] font-semibold text-ink-900">Smart routing</span>
            <span className="hidden text-[10px] text-ink-500 sm:inline">· auto</span>
          </div>


          <div className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-ink-700 sm:gap-2">
            <span className="hidden items-center gap-1 rounded-md border border-ink-200 bg-white/70 px-2 py-1 lg:flex">
              <Shield className="h-3 w-3 text-[color:var(--color-iris-cyan)]" />
              <span>End-to-end encrypted</span>
            </span>
            <span className="hidden items-center gap-1 rounded-md border border-ink-200 bg-white/70 px-2 py-1 font-mono md:flex">
              <Zap className="h-3 w-3 text-[color:var(--color-iris-warm)]" />
              <span>{totalTokens.toLocaleString()} tok</span>
            </span>
            <button
              onClick={toggleWorkspace}
              title="Toggle the live workspace panel (preview, code, console)"
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[11px] font-medium transition",
                previewOpen
                  ? "border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/10 text-ink-900"
                  : "border-ink-200 bg-white/70 text-ink-700 hover:border-[color:var(--color-iris)]/40 hover:text-ink-900",
              )}
            >
              <PanelRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Workspace</span>
            </button>
            <Link

              to="/image"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-ink-200 bg-white/70 px-2.5 text-[11px] font-medium text-ink-700 transition hover:border-[color:var(--color-iris-cyan)]/40 hover:bg-[color:var(--color-iris-cyan)]/[0.08] hover:text-ink-900"
              title="Free unlimited AI image generation"
            >
              <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                <span className="absolute inset-0 rounded-full opacity-70 blur-[3px]" style={{ background: "linear-gradient(135deg, var(--color-iris-deep), var(--color-iris-cyan))" }} />
                <span className="relative h-2 w-2 rounded-full" style={{ background: "linear-gradient(135deg, var(--color-iris-cyan), var(--color-iris-warm))" }} />
              </span>
              <span className="hidden sm:inline">Image Studio</span>
              <span className="sm:hidden">Image</span>
            </Link>
            <ThemePicker />
          </div>

        </header>

        {/* Messages */}
        <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
          {!active || active.messages.length === 0 ? (
            <EmptyState onPick={(q) => setInput(q)} model={model} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
              {active?.messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {isSending && <TypingIndicator model={model} />}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="relative border-t border-ink-200 bg-white">


          <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
            <div className="group relative">
              <div className="relative rounded-2xl border border-ink-200 bg-white p-2 shadow-sm transition focus-within:border-[color:var(--color-iris)] focus-within:ring-4 focus-within:ring-[color:var(--color-iris-soft)]">
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder="Ask Nexus X to build something…"
                  className="max-h-52 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[14px] leading-relaxed text-ink-900 placeholder:text-ink-400 focus:outline-none"
                />
                <div className="flex items-center justify-between px-1.5 pb-1 pt-1.5">
                  <div className="flex items-center gap-0.5">
                    <ComposerBtn label="Attach"><Paperclip className="h-4 w-4" /></ComposerBtn>
                    <ComposerBtn label="Image"><ImageIcon className="h-4 w-4" /></ComposerBtn>
                    <ComposerBtn label="Voice"><Mic className="h-4 w-4" /></ComposerBtn>
                    <ComposerBtn label="Commands"><Command className="h-4 w-4" /></ComposerBtn>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-[10px] text-ink-400 sm:inline">
                      <kbd className="rounded border border-ink-200 bg-ink-100 px-1 py-0.5 font-mono">⏎</kbd> send
                    </span>
                    <SendButton
                      onClick={() => void handleSend()}
                      disabled={!input.trim() || isSending}
                      loading={isSending}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2.5 text-center text-[10.5px] text-ink-400">
              Powered by <span className="font-medium text-ink-600">{model.name}</span> · Verify critical outputs.
            </div>

          </div>
        </div>
      </main>
      </Panel>

      {previewOpen && (
        <>
          <PanelResizeHandle className="group relative w-1.5 shrink-0 bg-transparent outline-none">
            <span
              aria-hidden
              className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink-200 transition group-hover:bg-[color:var(--color-iris)] group-data-[resize-handle-state=drag]:bg-[color:var(--color-iris)]"
            />
            <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-10 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-ink-200 bg-white/80 opacity-0 shadow-lg transition group-hover:opacity-100">
              <GripVertical className="h-3 w-3 text-ink-600" />
            </span>
          </PanelResizeHandle>
          <Panel id="workspace" defaultSize="46%" minSize="24%" className="min-w-0">
            <PreviewPanel />
          </Panel>
        </>
      )}
      </PanelGroup>
    </div>

  );
}

function ComposerBtn({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="group relative rounded-lg p-2 text-ink-500 transition hover:text-ink-900"
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-lg opacity-0 transition group-hover:opacity-100"
        style={{
          background: "radial-gradient(circle at center, color-mix(in oklab, var(--color-iris) 35%, transparent), transparent 70%)",
        }}
      />
      <span className="relative">{children}</span>
    </button>
  );
}

function SendButton({ onClick, disabled, loading }: { onClick: () => void; disabled: boolean; loading: boolean }) {
  const idle = !disabled;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Send"
      className={cn(
        "group relative inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl text-white transition-transform duration-200",
        "hover:scale-[1.06] active:scale-95",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50",
        idle && "iris-pulse-glow",
      )}
      style={{
        background: "var(--iris-gradient)",
        backgroundSize: "200% 100%",
        boxShadow:
          "0 10px 28px -8px color-mix(in oklab, var(--color-iris-deep) 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.4)",
      }}
    >
      {/* animated gradient sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100"
        style={{
          background: "linear-gradient(120deg, transparent 20%, rgba(255,255,255,0.35) 50%, transparent 80%)",
          transform: "translateX(-100%)",
          animation: idle ? "iris-sheen 1.6s ease-in-out infinite" : undefined,
        }}
      />
      <ArrowUp className={cn("relative h-4 w-4 transition", loading && "animate-pulse")} strokeWidth={2.75} />
    </button>
  );
}


const markdownComponents: Components = {
  code(props) {
    const { className, children, ...rest } = props as ComponentPropsWithoutRef<"code"> & {
      node?: unknown;
      inline?: boolean;
    };
    const match = /language-(\w+)/.exec(className || "");
    const raw = String(children ?? "").replace(/\n$/, "");
    const isBlock = raw.includes("\n") || Boolean(match);
    if (!isBlock) {
      return (
        <code
          {...rest}
          className="rounded bg-[color:var(--color-iris)]/10 px-1.5 py-0.5 font-mono text-[0.85em] text-[color:var(--color-iris)]"
        >
          {children}
        </code>
      );
    }
    return <CodeBlock language={match?.[1] ?? "text"} value={raw} />;
  },
  pre({ children }) { return <>{children}</>; },
  table({ children }) {
    return (
      <div className="my-4 overflow-x-auto rounded-xl border border-ink-200/80">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="border-b border-ink-200/80 bg-[color:var(--color-iris)]/[0.06] px-3 py-2 text-left font-medium uppercase tracking-wider text-[11px] text-[color:var(--color-gold-soft)]">{children}</th>;
  },
  td({ children }) {
    return <td className="border-b border-ink-200 px-3 py-2 align-top">{children}</td>;
  },
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-[color:var(--color-iris)] underline decoration-[color:var(--color-iris)]/30 underline-offset-4 hover:decoration-[color:var(--color-iris)]">
        {children}
      </a>
    );
  },
};

function sanitizeCode(input: string) {
  let out = input.replace(/\r\n/g, "\n").trim();
  // a full fence line the model sometimes leaves inside a block
  out = out.replace(/^`{3,4}[a-zA-Z0-9+-]*[ \t]*\n/, "");
  out = out.replace(/\n[ \t]*`{3,4}[ \t]*$/, "");
  // stray single backticks wrapping the snippet
  out = out.replace(/^`+(?=\S)/, "").replace(/`+$/, "");
  return out.trim();
}


/** Multi-file project generated by the model — opens in the live workspace. */
function ArtifactCard({ project }: { project: ArtifactProject }) {
  const { openProject } = usePreview();
  const paths = project.order;

  return (
    <div
      className="not-prose my-3 overflow-hidden rounded-2xl border border-ink-200 bg-white/70"
      style={{ boxShadow: "0 12px 30px -22px rgba(37,74,140,0.4)" }}
    >
      <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-lg text-white"
          style={{ background: "var(--iris-gradient)" }}
        >
          <FolderTree className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-medium text-ink-900">{project.title}</div>
          <div className="font-mono text-[10px] text-ink-500">
            {paths.length} file{paths.length > 1 ? "s" : ""} · entry {project.entry}
          </div>
        </div>
        <button
          onClick={() => openProject(project)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:brightness-110"
          style={{ background: "var(--iris-gradient)" }}
        >
          <PlayCircle className="h-3.5 w-3.5" />
          Open project
        </button>
      </div>
      <ul className="max-h-40 overflow-auto px-3 py-2">
        {paths.map((p) => (
          <li key={p} className="truncate font-mono text-[11px] leading-6 text-ink-600">
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CodeBlock({ language, value: rawValue }: { language: string; value: string }) {

  const value = useMemo(() => sanitizeCode(rawValue), [rawValue]);
  const [copied, setCopied] = useState(false);
  const { openPreview } = usePreview();

  const previewable = isPreviewable(language);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* ignore */}
  };
  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-ink-200/80" style={{
      background: "linear-gradient(180deg, #FFFFFF 0%, #F4F6F9 100%)",
      boxShadow: "0 10px 30px -18px rgba(37,74,140,0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
    }}>
      <div className="flex items-center justify-between border-b border-ink-200 bg-white/80 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-[color:var(--color-iris-warm)]/50" />
            <span className="h-2 w-2 rounded-full bg-[color:var(--color-iris)]/50" />
            <span className="h-2 w-2 rounded-full bg-[color:var(--color-iris-cyan)]/60" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">{language}</span>
        </div>
        <div className="flex items-center gap-1">
          {previewable && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => openPreview(value, language)}
              className="text-[10.5px] text-primary hover:bg-primary/10 hover:text-primary"
              aria-label="Open in live preview"
              title="Open in live workspace"
            >
              <PlayCircle className="h-3 w-3" />
              <span className="uppercase tracking-wider">Preview</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={onCopy}
            className="text-[10.5px]"
            aria-label="Copy code"
          >
            {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
            <span className="uppercase tracking-wider">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneLight}
        PreTag="div"
        customStyle={{
          margin: 0,
          background: "transparent",
          padding: "14px 16px",
          fontSize: "12.5px",
          lineHeight: "1.6",
        }}
        codeTagProps={{ style: { fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace" } }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={cn("flex gap-3 sm:gap-4", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
          isUser
            ? "border-ink-200 bg-white/80"
            : "border-transparent p-[1.5px]",
        )}
        style={!isUser ? { background: "var(--iris-gradient)" } : undefined}
      >
        {isUser ? (
          <span className="text-xs font-medium text-ink-900">A</span>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-white">
            <span className="font-display text-sm leading-none font-semibold text-[color:var(--color-iris)]">C</span>
          </div>
        )}
      </div>
      <div className={cn("min-w-0 max-w-[92%] sm:max-w-[85%]", isUser ? "text-right" : "text-left")}>
        <div className={cn("mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-ink-500", isUser && "justify-end")}>
          <span>{isUser ? "You" : "Nexus X"}</span>
          {!isUser && message.model && (
            <>
              <span className="text-ink-300">·</span>
              <span className="normal-case tracking-normal font-mono text-[color:var(--color-iris-cyan)]/90">
                {AI_MODELS.find((m) => m.id === message.model)?.name ?? message.model}
              </span>
            </>
          )}
          <span className="text-ink-300">·</span>
          <span className="normal-case font-mono">{time}</span>
        </div>
        <div
          className={cn(
            "relative rounded-2xl px-4 py-3 text-[14px] leading-relaxed",
            isUser
              ? "inline-block text-ink-900"
              : "border border-ink-200 text-ink-900",
          )}
          style={isUser ? {
            background: "linear-gradient(135deg, color-mix(in oklab, var(--color-iris-deep) 55%, transparent), color-mix(in oklab, var(--color-iris) 35%, transparent))",
            border: "1px solid color-mix(in oklab, var(--color-iris) 40%, transparent)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 24px -12px color-mix(in oklab, var(--color-iris-deep) 60%, transparent)",
          } : {
            background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(244,246,249,0.88))",
            boxShadow: "0 10px 30px -18px rgba(37,74,140,0.25), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
        >

          {isUser ? (
            <div className="whitespace-pre-wrap break-words text-left">{message.content}</div>
          ) : (
            <div className="prose prose-slate prose-sm max-w-none break-words prose-p:my-2 prose-headings:font-display prose-headings:tracking-tight prose-headings:mt-3 prose-headings:mb-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-[color:var(--color-iris-deep)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {hasArtifact(message.content) ? stripArtifacts(message.content) : message.content}
              </ReactMarkdown>
              {parseArtifacts(message.content).map((project) => (
                <ArtifactCard key={project.id} project={project} />
              ))}
            </div>
          )}

        </div>
        {!isUser && (message.tokens || message.latencyMs) && (
          <div className="mt-1.5 flex items-center gap-2 text-[10px] font-mono text-ink-500">
            {message.latencyMs && <span>{(message.latencyMs / 1000).toFixed(2)}s</span>}
            {message.tokens && <><span className="text-ink-200">·</span><span>{message.tokens} tokens</span></>}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ model }: { model: AIModel }) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl p-[1.5px]" style={{
        background: "var(--iris-gradient)",
      }}>
        <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-white">
          <span className="font-display text-sm font-semibold text-[color:var(--color-iris)]">C</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-500">
          Nexus X · <span className="normal-case tracking-normal font-mono text-[color:var(--color-iris-cyan)]/90">{model.name}</span>
        </div>
        <div className="inline-flex items-center gap-2 rounded-2xl border border-ink-200 px-4 py-3" style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(244,246,249,0.88))",
          boxShadow: "0 10px 30px -18px rgba(37,74,140,0.25), inset 0 1px 0 rgba(255,255,255,0.9)",
        }}>
          <div className="relative h-4 w-16 overflow-hidden rounded-full bg-ink-100">
            <div className="absolute inset-0 shimmer-gold" />
          </div>
          <span className="text-[11px] text-ink-700">reasoning…</span>

        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick, model }: { onPick: (q: string) => void; model: AIModel }) {
  const starters = [
    {
      key: "saas",
      title: "SaaS landing page",
      body: "Hero, pricing tiers and a comparison table.",
      prompt: "Build a modern SaaS landing page with a hero, 3 pricing tiers and a feature comparison table.",
    },
    {
      key: "table",
      title: "Data visualization table",
      body: "Responsive, sortable and filterable.",
      prompt: "Create a responsive data table with sorting, filtering and pagination.",
    },
    {
      key: "arch",
      title: "Architect a system",
      body: "Multi-tenant SaaS with auth and billing.",
      prompt: "Draft a scalable multi-tenant SaaS architecture with auth, billing and analytics.",
    },
    {
      key: "dash",
      title: "Analytics dashboard",
      body: "Charts, KPI cards and a sidebar shell.",
      prompt: "Build an analytics dashboard with KPI cards, a line chart and a collapsible sidebar.",
    },
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col items-center justify-center px-6 py-10 text-center">
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink-900">
        What can I build for you?
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-[13.5px] leading-relaxed text-ink-500">
        Describe your project or choose a quick start below to begin building with Nexus X AI.
      </p>

      <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
        {starters.map((s) => (
          <Card
            key={s.key}
            role="button"
            tabIndex={0}
            onClick={() => onPick(s.prompt)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onPick(s.prompt);
            }}
            className="cursor-pointer p-3 text-left transition hover:border-primary hover:bg-secondary"
          >
            <span className="block text-[12.5px] font-semibold text-foreground">{s.title}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{s.body}</span>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[10.5px] text-ink-500">
        <span className="flex items-center gap-1.5"><Shield className="h-3 w-3 text-[color:var(--color-iris)]" />E2E encrypted</span>
        <span className="text-ink-300">·</span>
        <span className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-[color:var(--color-iris)]" />Sub-second routing</span>
        <span className="text-ink-300">·</span>
        <span className="font-medium text-ink-600">{model.name}</span>
      </div>
    </div>
  );

}
