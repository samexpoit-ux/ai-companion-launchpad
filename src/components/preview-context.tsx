import { buildApiError, parseApiError, type ApiError } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ArtifactProject } from "@/lib/artifact";


export type PreviewLang =
  | "react"
  | "react-ts"
  | "html"
  | "vanilla"
  | "vanilla-ts"
  | "css"
  | "mdx";
export type PreviewTab = "preview" | "code" | "console";
export type PreviewDevice = "desktop" | "tablet" | "mobile";

export const DEVICE_WIDTH: Record<PreviewDevice, number | null> = {
  desktop: null,
  tablet: 834,
  mobile: 390,
};

export interface PreviewPayload {
  code: string;
  lang: PreviewLang;
  /** Multi-file virtual project (artifact mode). */
  files?: Record<string, string>;
  /** Entry file path inside `files`. */
  entry?: string;
  title?: string;
}


export type FixStatus = "idle" | "detected" | "fixing" | "review" | "fixed" | "failed" | "exhausted";

export interface FixEntry {
  attempt: number;
  summary: string;
  model?: string;
  at: number;
  ok: boolean;
}

/** A proposed AI patch, held until the user reviews the diff. */
export interface PendingPatch {
  attempt: number;
  summary: string;
  model?: string;
  changedPaths: string[];
  /** Snapshot of the project/file state the patch would produce. */
  next: PreviewPayload;
  /** State it replaces, used for the diff and for rollback. */
  previous: PreviewPayload;
}

/** An applied version we can roll back to. */
export interface PatchVersion {
  id: string;
  at: number;
  label: string;
  model?: string;
  changedPaths: string[];
  payload: PreviewPayload;
  /** true for the version that is currently loaded */
  current: boolean;
}

export const MAX_FIX_ATTEMPTS = 3;

interface PreviewContextValue {
  payload: PreviewPayload | null;
  isOpen: boolean;
  tab: PreviewTab;
  setTab: (t: PreviewTab) => void;
  device: PreviewDevice;
  setDevice: (d: PreviewDevice) => void;
  openPreview: (code: string, rawLang: string) => void;
  openProject: (project: ArtifactProject) => void;
  /** Empty the workspace (used when switching to a conversation with no build yet). */
  clearProject: () => void;
  /** Opens the split workspace panel even when nothing has been generated yet. */
  openWorkspace: () => void;
  toggleWorkspace: () => void;
  loadStarterProject: () => void;

  activeFile: string | null;
  setActiveFile: (path: string) => void;
  updateFile: (path: string, code: string) => void;
  /** Live keystroke sync: refreshes the preview without creating a version. */
  liveUpdateFile: (path: string, code: string) => void;
  liveEdit: boolean;
  setLiveEdit: (v: boolean) => void;
  /** Compile/build failure surfaced by the preview engine. */
  buildError: string | null;
  setBuildError: (m: string | null) => void;
  closePreview: () => void;


  /** bumped whenever the sandbox source is replaced, used to remount Sandpack */
  revision: number;
  // ---- auto bug-fix loop ----
  runtimeErrors: string[];
  reportRuntimeError: (message: string) => void;
  clearRuntimeErrors: () => void;
  consoleEntries: Array<{ id: number; level: "log" | "info" | "warn" | "error"; message: string }>;
  reportConsole: (level: "log" | "info" | "warn" | "error", message: string) => void;
  clearConsole: () => void;
  autoFixEnabled: boolean;
  setAutoFixEnabled: (v: boolean) => void;
  reviewBeforeApply: boolean;
  setReviewBeforeApply: (v: boolean) => void;
  fixStatus: FixStatus;
  fixAttempts: number;
  fixLog: FixEntry[];
  fixError: string | null;
  apiError: ApiError | null;
  clearApiError: () => void;
  runAutoFix: () => void;
  resetAutoFix: () => void;
  // ---- review + history ----
  pendingPatch: PendingPatch | null;
  applyPendingPatch: () => void;
  discardPendingPatch: () => void;
  versions: PatchVersion[];
  activeVersionId: string | null;
  rollbackTo: (id: string) => void;
}


const PreviewContext = createContext<PreviewContextValue | null>(null);

const PREVIEWABLE = new Set([
  "jsx", "tsx", "js", "javascript", "ts", "typescript",
  "html", "htm", "css", "mdx", "md", "markdown",
]);

export function isPreviewable(lang: string) {
  return PREVIEWABLE.has(lang.toLowerCase());
}

const hasJsx = (code: string) =>
  /<\/[A-Za-z][\w.-]*>|<[A-Z][\w.-]*[\s/>]|<[a-z]+[^<>]*\/>/.test(code) ||
  /\bimport\s+React\b|from\s+["']react["']/.test(code);

function smartDetect(code: string, rawLang: string): PreviewLang {
  const l = rawLang.toLowerCase();
  if (l === "html" || l === "htm") return "html";
  if (l === "css") return "css";
  if (l === "mdx" || l === "md" || l === "markdown") return "mdx";
  if (l === "tsx") return "react-ts";
  if (l === "jsx") return "react";
  if (l === "ts" || l === "typescript") return hasJsx(code) ? "react-ts" : "vanilla-ts";
  if (l === "js" || l === "javascript") {
    if (hasJsx(code)) return "react";
    if (/<!doctype html>|<html[\s>]|<body[\s>]/i.test(code)) return "html";
    return "vanilla";
  }
  return "vanilla";
}

// Sandbox noise that is never worth an AI patch.
const IGNORED = [
  /favicon/i,
  /ResizeObserver loop/i,
  /Download the React DevTools/i,
  /sandpack/i,
  /net::ERR_/i,
];

function isNoise(message: string) {
  const m = message.trim();
  if (m.length < 4) return true;
  return IGNORED.some((re) => re.test(m));
}

let versionSeq = 0;
const newVersionId = () => `v${Date.now().toString(36)}-${(versionSeq++).toString(36)}`;

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<PreviewTab>("preview");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [revision, setRevision] = useState(0);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [liveEdit, setLiveEdit] = useState(true);
  const [buildError, setBuildError] = useState<string | null>(null);



  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([]);
  const [consoleEntries, setConsoleEntries] = useState<Array<{ id: number; level: "log" | "info" | "warn" | "error"; message: string }>>([]);
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);
  const [reviewBeforeApply, setReviewBeforeApply] = useState(true);
  const [fixStatus, setFixStatus] = useState<FixStatus>("idle");
  const [fixAttempts, setFixAttempts] = useState(0);
  const [fixLog, setFixLog] = useState<FixEntry[]>([]);
  const [fixError, setFixError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const clearApiError = useCallback(() => setApiError(null), []);
  const [pendingPatch, setPendingPatch] = useState<PendingPatch | null>(null);
  const [versions, setVersions] = useState<PatchVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  const payloadRef = useRef<PreviewPayload | null>(null);
  payloadRef.current = payload;
  const errorsRef = useRef<string[]>([]);
  errorsRef.current = runtimeErrors;
  const attemptsRef = useRef(0);
  attemptsRef.current = fixAttempts;
  const reviewRef = useRef(true);
  reviewRef.current = reviewBeforeApply;
  const busyRef = useRef(false);
  const pendingRef = useRef<PendingPatch | null>(null);
  pendingRef.current = pendingPatch;
  const versionsRef = useRef<PatchVersion[]>([]);
  versionsRef.current = versions;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetFixState = useCallback(() => {
    setRuntimeErrors([]);
    setFixStatus("idle");
    setFixAttempts(0);
    setFixError(null);
    setFixLog([]);
    setPendingPatch(null);
  }, []);

  const resetAutoFix = resetFixState;

  const seedHistory = useCallback((next: PreviewPayload, label: string) => {
    const id = newVersionId();
    setVersions([
      { id, at: Date.now(), label, changedPaths: [], payload: next, current: true },
    ]);
    setActiveVersionId(id);
  }, []);

  const openPreview = useCallback(
    (code: string, rawLang: string) => {
      const next: PreviewPayload = { code, lang: smartDetect(code, rawLang) };
      setPayload(next);
      setIsOpen(true);
      setTab("preview");
      setRevision((r) => r + 1);
      resetFixState();
      seedHistory(next, "Original snippet");
    },
    [resetFixState, seedHistory],
  );

  const openProject = useCallback(
    (project: ArtifactProject) => {
      const entry = project.entry;
      const code = project.files[entry] ?? "";
      const next: PreviewPayload = {
        code,
        lang: smartDetect(code, entry.endsWith(".tsx") || entry.endsWith(".ts") ? "tsx" : "jsx"),
        files: project.files,
        entry,
        title: project.title,
      };
      setPayload(next);
      setActiveFile(entry);
      setIsOpen(true);
      setTab("preview");
      setRevision((r) => r + 1);
      resetFixState();
      seedHistory(next, `Original · ${project.title || "project"}`);
    },
    [resetFixState, seedHistory],
  );

  const pushVersion = useCallback(
    (next: PreviewPayload, label: string, changedPaths: string[], model?: string) => {
      const id = newVersionId();
      setVersions((prev) => [
        ...prev.map((v) => ({ ...v, current: false })),
        { id, at: Date.now(), label, model, changedPaths, payload: next, current: true },
      ]);
      setActiveVersionId(id);
    },
    [],
  );

  const updateFile = useCallback(
    (path: string, code: string) => {
      const prev = payloadRef.current;
      if (!prev?.files) return;
      const files = { ...prev.files, [path]: code };
      const next = { ...prev, files, code: path === prev.entry ? code : prev.code };
      setPayload(next);
      pushVersion(next, `Manual edit · ${path}`, [path]);
      setRevision((r) => r + 1);
    },
    [pushVersion],
  );

  /** Hot-reload the running preview from an in-progress edit (no version entry). */
  const liveUpdateFile = useCallback((path: string, code: string) => {
    const prev = payloadRef.current;
    if (!prev?.files) return;
    if (prev.files[path] === code) return;
    const files = { ...prev.files, [path]: code };
    setPayload({ ...prev, files, code: path === prev.entry ? code : prev.code });
    setBuildError(null);
    setRevision((r) => r + 1);
  }, []);



  const closePreview = useCallback(() => setIsOpen(false), []);

  const openWorkspace = useCallback(() => setIsOpen(true), []);
  const toggleWorkspace = useCallback(() => setIsOpen((o) => !o), []);

  const loadStarterProject = useCallback(() => {
    void import("@/lib/starter-project").then((mod) => openProject(mod.createStarterProject()));
  }, [openProject]);

  const clearProject = useCallback(() => {
    setPayload(null);
    setActiveFile(null);
    setVersions([]);
    setActiveVersionId(null);
    setBuildError(null);
    setConsoleEntries([]);
    resetFixState();
    setRevision((r) => r + 1);
  }, [resetFixState]);




  const clearRuntimeErrors = useCallback(() => {
    setRuntimeErrors([]);
    setFixStatus("idle");
  }, []);

  const reportRuntimeError = useCallback((message: string) => {
    const clean = String(message ?? "").trim().slice(0, 1200);
    if (!clean || isNoise(clean)) return;
    setRuntimeErrors((prev) => (prev.includes(clean) ? prev : [...prev, clean].slice(-8)));
    setFixStatus((s) => (s === "fixing" || s === "review" ? s : "detected"));
  }, []);

  const reportConsole = useCallback((level: "log" | "info" | "warn" | "error", message: string) => {
    const clean = String(message ?? "").trim().slice(0, 4000);
    if (!clean) return;
    setConsoleEntries((prev) => [...prev, { id: Date.now() + prev.length, level, message: clean }].slice(-200));
  }, []);
  const clearConsole = useCallback(() => setConsoleEntries([]), []);

  const commitPatch = useCallback(
    (patch: PendingPatch) => {
      setPayload(patch.next);
      setActiveFile(patch.changedPaths[0] ?? patch.next.entry ?? null);
      setRevision((r) => r + 1);
      setRuntimeErrors([]);
      setPendingPatch(null);
      const note = patch.changedPaths.length ? ` (${patch.changedPaths.join(", ")})` : "";
      setFixLog((l) => [
        ...l,
        { attempt: patch.attempt, summary: patch.summary + note, model: patch.model, at: Date.now(), ok: true },
      ]);
      pushVersion(
        patch.next,
        `AI patch · attempt ${patch.attempt}`,
        patch.changedPaths,
        patch.model,
      );
      setFixStatus("fixed");
    },
    [pushVersion],
  );

  const applyPendingPatch = useCallback(() => {
    const p = pendingRef.current;
    if (p) commitPatch(p);
  }, [commitPatch]);

  const discardPendingPatch = useCallback(() => {
    setPendingPatch(null);
    setFixStatus("detected");
    setFixLog((l) => [
      ...l,
      { attempt: attemptsRef.current, summary: "Patch discarded after review", at: Date.now(), ok: false },
    ]);
  }, []);

  const rollbackTo = useCallback((id: string) => {
    const target = versionsRef.current.find((v) => v.id === id);
    if (!target) return;
    setPayload(target.payload);
    setActiveFile(target.payload.entry ?? null);
    setRevision((r) => r + 1);
    setRuntimeErrors([]);
    setPendingPatch(null);
    setFixStatus("idle");
    setActiveVersionId(id);
    setVersions((prev) => prev.map((v) => ({ ...v, current: v.id === id })));
  }, []);


  const runAutoFix = useCallback(async () => {
    const current = payloadRef.current;
    const errors = errorsRef.current;
    if (!current || errors.length === 0 || busyRef.current) return;

    busyRef.current = true;
    const attempt = attemptsRef.current + 1;
    setFixAttempts(attempt);
    setFixStatus("fixing");
    setFixError(null);

    try {
      const res = await apiFetch("/api/autofix", {
        code: current.code,
        lang: current.lang,
        errors,
        attempt,
        files: current.files,
        entry: current.entry,
      });
      const data = (await res.json()) as {
        code?: string;
        files?: Record<string, string>;
        changedPaths?: string[];
        summary?: string;
        changed?: boolean;
        model?: string;
        error?: unknown;
      };
      if (!res.ok || (!data.code && !data.files)) {
        const parsed = res.ok
          ? buildApiError("bad_model_output", "autofix", "The model did not return a usable patch.")
          : parseApiError(data, "autofix");
        setApiError(parsed);
        throw new Error(parsed.message);
      }
      setApiError(null);

      let next: PreviewPayload;
      let changedPaths: string[] = [];

      if (data.files && current.files) {
        const merged = { ...current.files, ...data.files };
        const entry = current.entry ?? Object.keys(merged)[0];
        next = { ...current, files: merged, code: merged[entry] ?? current.code };
        changedPaths =
          data.changedPaths?.length
            ? data.changedPaths
            : Object.keys(data.files).filter((p) => current.files?.[p] !== data.files?.[p]);
      } else if (current.files && data.code) {
        const entry = current.entry ?? Object.keys(current.files)[0];
        next = { ...current, files: { ...current.files, [entry]: data.code }, code: data.code };
        changedPaths = [entry];
      } else {
        next = { ...current, code: data.code!, files: undefined, entry: undefined };
        changedPaths = ["snippet"];
      }

      const patch: PendingPatch = {
        attempt,
        summary: data.summary || "Applied AI patch",
        model: data.model,
        changedPaths,
        next,
        previous: current,
      };

      if (reviewRef.current) {
        setPendingPatch(patch);
        setFixStatus("review");
      } else {
        commitPatch(patch);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Auto-fix failed";
      setApiError((prev) => prev ?? parseApiError(err, "autofix"));
      setFixError(message);
      setFixLog((l) => [...l, { attempt, summary: message, at: Date.now(), ok: false }]);
      setFixStatus("failed");
    } finally {
      busyRef.current = false;
    }
  }, [commitPatch]);

  // The loop: new errors -> debounce -> patch -> re-run -> repeat until clean or capped.
  useEffect(() => {
    if (!autoFixEnabled || !isOpen) return;
    if (runtimeErrors.length === 0) return;
    if (fixStatus === "fixing" || fixStatus === "review") return;
    if (pendingPatch) return;
    if (fixAttempts >= MAX_FIX_ATTEMPTS) {
      setFixStatus("exhausted");
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runAutoFix();
    }, 1400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runtimeErrors, autoFixEnabled, isOpen, fixStatus, fixAttempts, pendingPatch, runAutoFix]);

  return (
    <PreviewContext.Provider
      value={{
        payload,
        isOpen,
        tab,
        setTab,
        device,
        setDevice,
        openPreview,
        openProject,
        openWorkspace,
        toggleWorkspace,
        loadStarterProject,

        activeFile,
        setActiveFile,
        updateFile,
        liveUpdateFile,
        liveEdit,
        setLiveEdit,
        buildError,
        setBuildError,
        closePreview,


        revision,
        runtimeErrors,
        reportRuntimeError,
        clearRuntimeErrors,
        consoleEntries,
        reportConsole,
        clearConsole,
        autoFixEnabled,
        setAutoFixEnabled,
        reviewBeforeApply,
        setReviewBeforeApply,
        fixStatus,
        fixAttempts,
        fixLog,
        fixError,
        apiError,
        clearApiError,
        runAutoFix: () => void runAutoFix(),
        resetAutoFix,
        pendingPatch,
        applyPendingPatch,
        discardPendingPatch,
        versions,
        activeVersionId,
        rollbackTo,
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) throw new Error("usePreview must be used within PreviewProvider");
  return ctx;
}

