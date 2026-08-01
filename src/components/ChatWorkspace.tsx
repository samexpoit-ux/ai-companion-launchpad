import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
  Sparkle,
  Diamond,
  Mic,
  Loader2,
  Image as ImageIcon,
  ChevronRight,
  Crown,
  Coins,

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
import { actionForMode, formatCredits, ACTION_RULES } from "@/lib/credits";
import { useCredits } from "@/hooks/useCredits";
import { CreditMeter } from "@/components/CreditMeter";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  listThreads,
  listMessages,
  createThread as createDbThread,
  deleteThread as deleteDbThread,
  renameThread as renameDbThread,
  saveMessage,
  subscribeToChat,
} from "@/lib/chat-store";

import { BrandMark, BrandWordmark, BrandGlyph } from "@/components/BrandMark";
import { ThemePicker } from "@/components/ThemePicker";
import { Link, useRouterState } from "@tanstack/react-router";
import { takePendingPrompt } from "@/lib/pending-prompt";

import { PreviewProvider, usePreview, isPreviewable } from "@/components/preview-context";
import { PreviewPanel } from "@/components/PreviewPanel";
import { PlayCircle, GripVertical, FolderTree, PanelRight } from "lucide-react";
import { hasArtifact, parseArtifacts, stripArtifacts, type ArtifactProject } from "@/lib/artifact";
import { ActivityCard, stepsForMessage } from "@/components/ActivityCard";


import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";



const uid = () => Math.random().toString(36).slice(2, 10);
const createFreshThread = (): ChatThread => ({
  id: uid(),
  title: "Untitled dossier",
  messages: [],
  updatedAt: Date.now(),
});

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
  const [mode, setMode] = useState<"Build" | "Chat" | "Plan">("Build");
  const [loadedThreads, setLoadedThreads] = useState<Set<string>>(() => new Set());
  const credits = useCredits();
  
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
  const sidebarRef = useRef<HTMLElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations from the database (single source of truth).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listThreads();
      if (cancelled) return;

      let mapped: ChatThread[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        messages: [],
        updatedAt: new Date(r.lastMessageAt).getTime(),
      }));

      if (mapped.length === 0) {
        const created = await createDbThread({ title: "Untitled dossier", mode: "build" });
        if (cancelled) return;
        mapped = created
          ? [{ id: created.id, title: created.title, messages: [], updatedAt: Date.now() }]
          : [createFreshThread()];
      }

      const openId =
        requestedThreadId && mapped.some((t) => t.id === requestedThreadId)
          ? requestedThreadId
          : mapped[0].id;

      const messages = await listMessages(openId);
      if (cancelled) return;
      setThreads(
        mapped.map((t) =>
          t.id === openId
            ? {
                ...t,
                messages: messages.map((m) => ({
                  id: m.clientId ?? m.id,
                  role: m.role === "assistant" ? "assistant" : "user",
                  content: m.content,
                  createdAt: new Date(m.createdAt).getTime(),
                  model: m.model ?? undefined,
                  tokens: m.tokens ?? undefined,
                  latencyMs: m.latencyMs ?? undefined,
                })),
              }
            : t,
        ),
      );
      setActiveId(openId);
      setLoadedThreads(new Set([openId]));
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once; the deep link comes from the initial URL.
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

  /**
   * Live sync: threads and messages written anywhere (another tab, another
   * device, the server) land in this workspace immediately.
   */
  useEffect(() => {
    const userId = user?.id;
    if (!userId || !hydrated) return;
    return subscribeToChat(userId, {
      onThreadUpsert: (row) => {
        setThreads((prev) => {
          const at = prev.findIndex((t) => t.id === row.id);
          const updatedAt = new Date(row.lastMessageAt).getTime();
          if (at === -1) {
            return [{ id: row.id, title: row.title, messages: [], updatedAt }, ...prev];
          }
          const next = [...prev];
          next[at] = { ...next[at], title: row.title, updatedAt };
          return next.sort((a, b) => b.updatedAt - a.updatedAt);
        });
      },
      onThreadDelete: (threadId) => {
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
      },
      onMessage: (threadId, message) => {
        const clientId = message.clientId ?? message.id;
        setThreads((prev) =>
          prev.map((t) => {
            if (t.id !== threadId) return t;
            if (t.messages.some((m) => m.id === clientId)) return t;
            return {
              ...t,
              updatedAt: new Date(message.createdAt).getTime(),
              messages: [
                ...t.messages,
                {
                  id: clientId,
                  role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
                  content: message.content,
                  createdAt: new Date(message.createdAt).getTime(),
                  ...(message.model ? { model: message.model } : {}),
                  ...(message.tokens != null ? { tokens: message.tokens } : {}),
                  ...(message.latencyMs != null ? { latencyMs: message.latencyMs } : {}),
                },
              ],
            };
          }),
        );
      },
    });
  }, [user?.id, hydrated]);




  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  useFocusTrap(sidebarRef, isMobile && sidebarOpen, closeSidebar);

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
    ta.style.height = Math.min(ta.scrollHeight, 224) + "px";
  }, [input]);

  const newChat = async () => {
    if (active && active.messages.length === 0) {
      setInput("");
      return;
    }
    const created = await createDbThread({ title: "Untitled dossier", mode: mode.toLowerCase() });
    const t: ChatThread = created
      ? { id: created.id, title: created.title, messages: [], updatedAt: Date.now() }
      : createFreshThread();
    setThreads((prev) => [t, ...prev]);
    setActiveId(t.id);
    setLoadedThreads((prev) => new Set(prev).add(t.id));
    setInput("");
    void navigate({ to: "/workspace", search: { thread: t.id }, replace: true });
  };

  const deleteThread = (id: string) => {
    void deleteDbThread(id);
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
      void renameDbThread(id, title);
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

  /** Open a conversation from the history panel and keep the URL in sync. */
  const selectThread = useCallback(
    (id: string) => {
      setActiveId(id);
      if (isMobile) setSidebarOpen(false);
      void navigate({ to: "/workspace", search: { thread: id }, replace: true });
      if (loadedThreads.has(id)) return;
      void (async () => {
        const rows = await listMessages(id);
        setThreads((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  messages: rows.map((m) => ({
                    id: m.clientId ?? m.id,
                    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
                    content: m.content,
                    createdAt: new Date(m.createdAt).getTime(),
                    model: m.model ?? undefined,
                    tokens: m.tokens ?? undefined,
                    latencyMs: m.latencyMs ?? undefined,
                  })),
                }
              : t,
          ),
        );
        setLoadedThreads((prev) => new Set(prev).add(id));
      })();
    },
    [isMobile, navigate, loadedThreads],
  );


  const sendText = useCallback(
    async (text: string, thread: ChatThread) => {
      const value = text.trim();
      if (!value) return;
      const action = actionForMode(mode);
      if (!credits.canAfford(action, value.length)) {
        updateThread(thread.id, (t) => ({
          ...t,
          messages: [
            ...t.messages,
            {
              id: uid(),
              role: "assistant",
              content: `**Out of credits**\n\nThis ${ACTION_RULES[action].label.toLowerCase()} needs ${formatCredits(
                credits.quote(action, value.length),
              )} credits but only ${formatCredits(credits.remaining)} remain. Upgrade your plan from the dashboard to continue.`,
              createdAt: Date.now(),
            },
          ],
          updatedAt: Date.now(),
        }));
        return;
      }

      const userMsg: ChatMessage = { id: uid(), role: "user", content: value, createdAt: Date.now() };
      const isFirst = thread.messages.length === 0;
      updateThread(thread.id, (t) => ({
        ...t,
        title: isFirst ? value.slice(0, 48) : t.title,
        messages: [...t.messages, userMsg],
        updatedAt: Date.now(),
      }));
      setIsSending(true);
      if (isFirst) void renameDbThread(thread.id, value.slice(0, 48));
      void saveMessage({
        threadId: thread.id,
        clientId: userMsg.id,
        role: "user",
        content: value,
      });
      try {
        const reply = await sendChatMessage([...(thread.messages ?? []), userMsg], modelId, {
          plan: credits.plan,
          mode,
          threadId: thread.id,
        });
        const asstMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: reply.content,
          model: reply.model,
          tokens: reply.tokens,
          latencyMs: reply.latencyMs,
          credits: reply.credits?.charged,
          createdAt: Date.now(),
        };
        updateThread(thread.id, (t) => ({
          ...t,
          messages: [...t.messages, asstMsg],
          updatedAt: Date.now(),
        }));
        void saveMessage({
          threadId: thread.id,
          clientId: asstMsg.id,
          role: "assistant",
          content: asstMsg.content,
          model: asstMsg.model ?? null,
          tokens: asstMsg.tokens ?? null,
          latencyMs: asstMsg.latencyMs ?? null,
        });
        if (reply.credits) credits.applyServerBalance(reply.credits);
        else void credits.refresh();
      } catch (error) {
        const apiErr = parseApiError(error, "chat");
        // Server rejected the charge — pull the authoritative balance back in.
        if (apiErr.code === "insufficient_credits" || apiErr.code === "unauthenticated") {
          void credits.refresh();
        }
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
    [modelId, updateThread, mode, credits],
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
    if (pending.mode === "Build" || pending.mode === "Chat" || pending.mode === "Plan") {
      setMode(pending.mode);
    }

    const current = threads.find((t) => t.id === activeId);
    if (current && current.messages.length === 0) {
      setInput("");
      void sendText(pending.prompt, current);
      return;
    }
    void (async () => {
      const created = await createDbThread({
        title: pending.prompt.slice(0, 48),
        mode: pending.mode.toLowerCase(),
      });
      const fresh: ChatThread = created
        ? { id: created.id, title: created.title, messages: [], updatedAt: Date.now() }
        : createFreshThread();
      setThreads((prev) => [fresh, ...prev]);
      setActiveId(fresh.id);
      setLoadedThreads((prev) => new Set(prev).add(fresh.id));
      setInput("");
      await sendText(pending.prompt, fresh);
    })();
  }, [hydrated, threads, activeId, sendText]);


  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };


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
        ref={sidebarRef}
        id="workspace-sidebar"
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile && sidebarOpen ? true : undefined}
        aria-label="Chat history and account"
        aria-hidden={!sidebarOpen && isMobile ? true : undefined}
        tabIndex={-1}
        className={cn(
          "flex h-full w-[86vw] max-w-[300px] shrink-0 flex-col border-r border-ink-200 bg-ink-100 transition-transform duration-300 md:w-64 md:max-w-none",
          "fixed inset-y-0 left-0 z-40 md:relative md:translate-x-0",
          sidebarOpen
            ? "translate-x-0 shadow-2xl md:shadow-none"
            : "-translate-x-full md:w-0 md:-translate-x-0 md:overflow-hidden md:border-0",
        )}
      >


        {/* Brand */}
        <div className="flex items-center gap-2.5 border-b border-ink-200 px-4 py-4">
          <BrandMark size="md" />
          <div className="min-w-0">
            <BrandWordmark className="block text-sm font-bold leading-tight" />
            <div className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">
              Build · Preview · Ship
            </div>
          </div>
        </div>

        {/* New chat + search */}
        <div className="flex flex-col gap-3 border-b border-ink-200 p-4">
          <Button onClick={() => void newChat()} className="w-full rounded-xl font-display font-semibold active:scale-[0.99]">
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
          <span className="text-2xs font-bold uppercase tracking-[0.18em] text-ink-400">Chat history</span>
          <span className="rounded-full bg-ink-200 px-1.5 text-2xs text-ink-500">{filtered.length}</span>
        </div>



        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {filtered.map((t) => {
            const isRenaming = renamingId === t.id;
            const isActive = t.id === activeId;
            return (
              <div
                key={t.id}
                className={cn(
                  "group relative mb-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
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
                      className="h-7 flex-1 px-1.5 text-sm"
                    />
                    <Button variant="ghost" size="icon-sm" onClick={commitRename} className="text-primary" aria-label="Save name"><Check className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon-sm" onClick={cancelRename} aria-label="Cancel rename"><X className="h-3.5 w-3.5" /></Button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => selectThread(t.id)}
                      onDoubleClick={() => startRename(t)}
                      className="min-w-0 flex-1 text-left"
                    >

                      <div className="truncate">{t.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-ink-500">
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
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-ink-400">
              {query.trim() ? "No conversation matches that search." : "No conversations yet."}
            </p>
          )}
        </div>


        {/* Credits */}
        <div className="px-3 pb-1">
          <CreditMeter plan={credits.plan} remaining={credits.remaining} total={credits.total} />
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
                <div className="truncate text-sm font-medium">{accountName}</div>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-2xs">
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




      </aside>

      {/* Main + Live workspace (resizable split) */}
      <PanelGroup orientation="horizontal" className="flex h-full min-w-0 flex-1">
      <Panel id="chat" minSize="26%" className="flex min-w-0 flex-col">
      <main className="relative flex h-full min-w-0 flex-1 flex-col">

        {/* Header */}
        <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 overflow-hidden border-b border-ink-200 bg-white px-3 sm:gap-3 sm:px-6">


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
            title="Nexura automatically picks the best-value model for each request"
          >
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[color:var(--color-iris)]" />
            <span className="truncate text-xs font-semibold text-ink-900">Smart routing</span>
            <span className="hidden text-2xs text-ink-500 sm:inline">· auto</span>
          </div>


          <div className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-ink-700 sm:gap-2">

            <button
              onClick={toggleWorkspace}
              data-testid="workspace-toggle"
              aria-label="Toggle live workspace"
              title="Toggle the live workspace panel (preview, code, console)"
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium transition",
                previewOpen
                  ? "border-[color:var(--color-iris)]/45 bg-[color:var(--color-iris)]/10 text-ink-900"
                  : "border-ink-200 bg-white/70 text-ink-700 hover:border-[color:var(--color-iris)]/40 hover:text-ink-900",
              )}
            >
              <PanelRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Workspace</span>
            </button>
            <span
              className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-ink-200 bg-white/70 px-2.5 text-xs font-medium text-ink-700"
              title="Credits included in your workspace plan"
            >
              <Coins className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />
              {formatCredits(credits.remaining)}
              <span className="hidden text-ink-400 sm:inline">
                / {formatCredits(credits.total)} credits
              </span>
            </span>

            <ThemePicker />
          </div>

        </header>

        {/* Messages */}
        <div ref={scrollRef} className="relative flex-1 overflow-y-auto">
          {!active || active.messages.length === 0 ? (
            <EmptyState onPick={(q) => setInput(q)} model={model} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-10">
              {active?.messages.map((m) => (
                <MessageBubble key={m.id} message={m} userInitial={accountName.charAt(0).toUpperCase()} />
              ))}
              {isSending && <TypingIndicator model={model} />}
            </div>
          )}
        </div>

        {/* Composer — Lovable-style floating prompt box */}
        <div className="relative shrink-0 bg-white">
          {/* soft fade so the transcript melts into the composer instead of a hard rule */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-white"
          />

          <div className="nx-rise mx-auto w-full max-w-3xl px-3 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-3">
            <div
              data-testid="composer"
              className={cn(
                "group relative rounded-[26px] border border-ink-200 bg-white",
                "transition-[box-shadow,border-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                "shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-16px_rgba(16,24,40,0.18)]",
                "hover:border-ink-300 hover:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_38px_-18px_rgba(16,24,40,0.22)]",
                "focus-within:-translate-y-0.5 focus-within:border-[color:var(--color-iris)]/50",
                "focus-within:shadow-[0_1px_2px_rgba(16,24,40,0.05),0_22px_50px_-20px_color-mix(in_oklab,var(--color-iris)_50%,transparent)]",
              )}
            >
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask Nexura to build something…"
                className="block max-h-56 w-full resize-none bg-transparent px-4 pb-2 pt-4 text-[15px] leading-6 text-ink-900 transition-[height] duration-150 ease-out placeholder:text-ink-400 focus:outline-none sm:px-5 sm:pt-4.5"
              />

              <div className="flex items-center gap-1.5 px-3 pb-3 pt-0.5 sm:px-3.5">
                {/* + menu, exactly one entry point for attachments like Lovable */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Add attachment"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink-200 text-ink-600 transition-all duration-150 hover:border-ink-300 hover:bg-ink-100 hover:text-ink-900 active:scale-95 data-[state=open]:border-[color:var(--color-iris)]/45 data-[state=open]:text-ink-900"
                    >
                      <Plus className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-45" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="w-52">
                    <DropdownMenuItem>
                      <Paperclip className="mr-2 h-4 w-4" /> Attach a file
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <ImageIcon className="mr-2 h-4 w-4" /> Add an image
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Command className="mr-2 h-4 w-4" /> Browse commands
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <span className="hidden min-w-0 truncate text-2xs text-ink-400 sm:inline">
                  {ACTION_RULES[actionForMode(mode)].label} ·{" "}
                  <span className="font-medium text-ink-600">
                    {formatCredits(credits.quote(actionForMode(mode), input.length))}
                  </span>{" "}
                  credits
                </span>

                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {/* Mode as a compact dropdown, not a tab strip */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Response mode"
                        className="inline-flex h-8 max-w-[7.5rem] shrink-0 items-center gap-1 truncate rounded-full px-2.5 text-xs font-medium text-ink-700 transition-colors duration-150 hover:bg-ink-100 hover:text-ink-900 data-[state=open]:bg-ink-100 data-[state=open]:text-ink-900"
                      >
                        {mode}
                        <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="w-64">
                      {(["Build", "Chat", "Plan"] as const).map((m) => (
                        <DropdownMenuItem key={m} onSelect={() => setMode(m)} className="items-start gap-2">
                          <Check
                            className={cn(
                              "mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--color-iris)]",
                              mode === m ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-ink-900">{m}</span>
                            <span className="block text-2xs leading-snug text-ink-500">
                              {ACTION_RULES[actionForMode(m)].note}
                            </span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    type="button"
                    aria-label="Voice input"
                    className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-500 transition-all duration-150 hover:bg-ink-100 hover:text-ink-900 active:scale-95 sm:inline-flex"
                  >
                    <Mic className="h-4 w-4" />
                  </button>

                  <SendButton
                    onClick={() => void handleSend()}
                    disabled={!input.trim() || isSending}
                    loading={isSending}
                  />
                </div>
              </div>
            </div>

            <p className="mt-3 text-center text-2xs leading-relaxed text-ink-400">
              Smart routing · {formatCredits(credits.remaining)} of {formatCredits(credits.total)} credits left
            </p>
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

function SendButton({ onClick, disabled, loading }: { onClick: () => void; disabled: boolean; loading: boolean }) {
  const ready = !disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={loading ? "Sending" : "Send message"}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95",
        ready
          ? "nx-pop scale-100 text-white shadow-[0_6px_16px_-8px_color-mix(in_oklab,var(--color-iris-deep)_80%,transparent)] hover:scale-105"
          : "scale-95 cursor-not-allowed bg-ink-200 text-ink-400",
      )}
      style={ready ? { background: "var(--iris-gradient)" } : undefined}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
      ) : (
        <ArrowUp className="h-4 w-4" strokeWidth={2.75} />
      )}
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
    return <th className="border-b border-ink-200/80 bg-[color:var(--color-iris)]/[0.06] px-3 py-2 text-left font-medium uppercase tracking-wider text-xs text-[color:var(--color-gold-soft)]">{children}</th>;
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
          <div className="truncate text-xs font-medium text-ink-900">{project.title}</div>
          <div className="font-mono text-2xs text-ink-500">
            {paths.length} file{paths.length > 1 ? "s" : ""} · entry {project.entry}
          </div>
        </div>
        <button
          onClick={() => openProject(project)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition hover:brightness-110"
          style={{ background: "var(--iris-gradient)" }}
        >
          <PlayCircle className="h-3.5 w-3.5" />
          Open project
        </button>
      </div>
      <ul className="max-h-40 overflow-auto px-3 py-2">
        {paths.map((p) => (
          <li key={p} className="truncate font-mono text-xs leading-6 text-ink-600">
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
          <span className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-500">{language}</span>
        </div>
        <div className="flex items-center gap-1">
          {previewable && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => openPreview(value, language)}
              className="text-2xs text-primary hover:bg-primary/10 hover:text-primary"
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
            className="text-2xs"
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

function MessageBubble({ message, userInitial = "Y" }: { message: ChatMessage; userInitial?: string }) {
  const isUser = message.role === "user";
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const project = !isUser ? parseArtifacts(message.content)[0] ?? null : null;
  const modelName = message.model
    ? AI_MODELS.find((m) => m.id === message.model)?.name ?? message.model
    : undefined;
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
          <span className="text-xs font-medium text-ink-900">{userInitial}</span>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-white p-1">
            <BrandGlyph />
          </div>
        )}
      </div>
      <div className={cn("min-w-0 max-w-[92%] sm:max-w-[85%]", isUser ? "text-right" : "text-left")}>
        <div className={cn("mb-1.5 flex items-center gap-2 text-2xs uppercase tracking-[0.18em] text-ink-500", isUser && "justify-end")}>
          <span>{isUser ? "You" : "Nexura"}</span>
          {!isUser && message.model && (
            <>
              <span className="text-ink-300">·</span>
              <span className="normal-case tracking-normal font-mono text-[color:var(--color-iris-cyan)]/90">
                {modelName}
              </span>
            </>
          )}
          <span className="text-ink-300">·</span>
          <span className="normal-case font-mono">{time}</span>
        </div>
        {!isUser && (
          <ActivityCard
            title={project ? `Built ${project.title || "your project"}` : "Responded to your prompt"}
            project={project}
            steps={stepsForMessage({
              modelName,
              latencyMs: message.latencyMs,
              tokens: message.tokens,
              credits: message.credits,
              fileCount: project?.order.length,
            })}
          />
        )}
        <div
          className={cn(
            "relative rounded-2xl px-4 py-3 text-base leading-relaxed",
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
            </div>
          )}

        </div>

        {!isUser && (message.tokens || message.latencyMs || message.credits != null) && (
          <div className="mt-1.5 flex items-center gap-2 font-mono text-2xs text-ink-500">
            {message.latencyMs && <span>{(message.latencyMs / 1000).toFixed(2)}s</span>}
            {message.tokens && <><span className="text-ink-200">·</span><span>{message.tokens} tokens</span></>}
            {message.credits != null && (
              <>
                <span className="text-ink-200">·</span>
                <span className="text-[color:var(--color-iris)]">
                  {formatCredits(message.credits)} credits
                </span>
              </>
            )}
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
        <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-white p-1">
          <BrandGlyph />
        </div>
      </div>
      <div className="min-w-0 flex-1 max-w-[92%] sm:max-w-[85%]">
        <div className="mb-1.5 text-2xs uppercase tracking-[0.18em] text-ink-500">
          Nexura · <span className="normal-case tracking-normal font-mono text-[color:var(--color-iris-cyan)]/90">{model.name}</span>
        </div>
        <ActivityCard
          busy
          title="Working on it…"
          steps={[
            { label: "Analysed the prompt", detail: "smart cost router", done: true },
            { label: "Routed to model", detail: model.name, done: true },
            { label: "Thinking and writing the response", done: false },
          ]}
        />
      </div>
    </div>
  );
}


function EmptyState({ onPick, model }: { onPick: (q: string) => void; model: AIModel }) {
  const starters = [
    {
      key: "saas",
      icon: Sparkle,
      title: "SaaS landing page",
      body: "Hero, pricing tiers and a comparison table.",
      prompt: "Build a modern SaaS landing page with a hero, 3 pricing tiers and a feature comparison table.",
    },
    {
      key: "table",
      icon: Command,
      title: "Data table",
      body: "Responsive, sortable and filterable.",
      prompt: "Create a responsive data table with sorting, filtering and pagination.",
    },
    {
      key: "arch",
      icon: Diamond,
      title: "Architect a system",
      body: "Multi-tenant SaaS with auth and billing.",
      prompt: "Draft a scalable multi-tenant SaaS architecture with auth, billing and analytics.",
    },
    {
      key: "dash",
      icon: Zap,
      title: "Analytics dashboard",
      body: "Charts, KPI cards and a sidebar shell.",
      prompt: "Build an analytics dashboard with KPI cards, a line chart and a collapsible sidebar.",
    },
  ];

  return (
    <div
      data-testid="workspace-empty-state"
      className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center gap-6 px-5 py-10 text-center sm:px-6"
    >
      {/* Illustration: brand mark on a soft aurora halo */}
      <div className="nx-rise relative flex items-center justify-center">
        <span
          aria-hidden
          className="absolute h-24 w-24 rounded-full blur-2xl sm:h-28 sm:w-28"
          style={{ background: "var(--iris-gradient)", opacity: 0.22 }}
        />
        <span
          aria-hidden
          className="absolute h-16 w-16 rounded-full border border-[color:var(--color-iris)]/25 sm:h-20 sm:w-20"
        />
        <BrandMark size="lg" className="relative" />
      </div>

      <div className="nx-rise space-y-2.5" style={{ animationDelay: "70ms" }}>
        <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-3xl">
          What should we build today?
        </h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-ink-500">
          Describe your idea below — Nexura builds, previews and ships it in one workspace.
        </p>
      </div>

      {/* Suggestion pills — two balanced rows on every viewport */}
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {starters.map((s, i) => (
          <button
            key={s.key}
            type="button"
            data-testid="starter-pill"
            onClick={() => onPick(s.prompt)}
            title={s.body}
            style={{ animationDelay: `${140 + i * 60}ms` }}
            className={cn(
              "nx-rise group inline-flex min-w-0 items-center gap-2 rounded-full border border-ink-200 bg-white px-3.5 py-2 text-left",
              "text-xs font-medium text-ink-700 transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
              "hover:-translate-y-0.5 hover:border-[color:var(--color-iris)]/45 hover:text-ink-900 hover:shadow-[0_10px_24px_-14px_rgba(16,24,40,0.35)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-iris)]/35",
            )}
          >
            <s.icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-iris)]" />
            <span className="truncate">{s.title}</span>
            <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[color:var(--color-iris)]" />
          </button>
        ))}
      </div>

      {/* Credit / trust note — same rhythm as the composer footnote */}
      <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 text-2xs text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-[color:var(--color-iris)]" />
          Smart routing
        </span>

        <span className="text-ink-300">·</span>
        <span className="font-medium text-ink-600">{model.name}</span>
      </div>
    </div>
  );
}


