import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
  Download,
  File as FileIcon,
  FileArchive,
  Folder,
  FolderOpen,
  Pencil,
  Save,
  Zap,
  ZapOff,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

import { cn } from "@/lib/utils";
import { usePreview } from "./preview-context";

interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const path of [...paths].sort()) {
    const parts = path.split("/");
    let level = root;
    let acc = "";

    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let node = level.find((n) => n.name === part && !!n.children === !isFile);
      if (!node) {
        node = isFile ? { name: part, path: acc } : { name: part, path: acc, children: [] };
        level.push(node);
      }
      if (!isFile) level = node.children!;
    });
  }

  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n))
      .sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name));

  return sort(root);
}

/** Prism language for a file path. */
function langFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "tsx" || ext === "ts") return "tsx";
  if (ext === "jsx" || ext === "js" || ext === "mjs" || ext === "cjs") return "jsx";
  if (ext === "json") return "json";
  if (ext === "css") return "css";
  if (ext === "html" || ext === "htm") return "markup";
  if (ext === "md" || ext === "mdx") return "markdown";
  if (ext === "sql") return "sql";
  if (ext === "sh" || ext === "bash") return "bash";
  return "text";
}

function TreeItem({
  node,
  depth,
  active,
  changed,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  active: string | null;
  changed: Set<string>;
  onSelect: (p: string) => void;
}) {
  const [open, setOpen] = useState(true);

  if (!node.children) {
    const isActive = active === node.path;
    const isChanged = changed.has(node.path);
    return (
      <button
        onClick={() => onSelect(node.path)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition",
          isActive
            ? "bg-white text-ink-900 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-iris)_35%,transparent)]"
            : "text-ink-600 hover:bg-ink-900/5 hover:text-ink-900",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <FileIcon className="h-3 w-3 shrink-0 opacity-60" />
        <span className="truncate">{node.name}</span>
        {isChanged && (
          <span
            title="Changed in the latest AI edit"
            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-iris)]"
          />
        )}
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-xs text-ink-700 hover:bg-ink-900/5"
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        <ChevronRight className={cn("h-3 w-3 transition", open && "rotate-90")} />
        {open ? <FolderOpen className="h-3 w-3 opacity-70" /> : <Folder className="h-3 w-3 opacity-70" />}
        <span className="truncate font-medium">{node.name}</span>
      </button>
      {open &&
        node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            active={active}
            changed={changed}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

/** File explorer + read-only highlighted view + inline editor for artifact projects. */
export default function ProjectExplorer() {
  const {
    payload,
    activeFile,
    setActiveFile,
    updateFile,
    liveUpdateFile,
    liveEdit,
    setLiveEdit,
    versions,
  } = usePreview();
  const files = payload?.files ?? {};
  const paths = useMemo(() => Object.keys(files), [files]);
  const tree = useMemo(() => buildTree(paths), [paths]);

  /** Files touched by the most recent AI patch — shown with a dot in the tree. */
  const changed = useMemo(() => {
    const latest = versions.find((v) => v.current) ?? versions[versions.length - 1];
    return new Set(latest?.changedPaths ?? []);
  }, [versions]);

  const current = activeFile && files[activeFile] != null ? activeFile : (payload?.entry ?? paths[0]);
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);
  const value = draft ?? files[current] ?? "";
  const dirty = draft != null && draft !== files[current];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const select = (path: string) => {
    if (timer.current) clearTimeout(timer.current);
    setDraft(null);
    setActiveFile(path);
  };

  const onEdit = (next: string) => {
    setDraft(next);
    if (!liveEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => liveUpdateFile(current, next), 400);
  };

  const copyFile = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFile = () => {
    downloadBlob(new Blob([value], { type: "text/plain;charset=utf-8" }), current.split("/").pop() || "file.txt");
  };

  /** Export every file of the project as a zip the user can run locally. */
  const downloadZip = async () => {
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const [path, code] of Object.entries(files)) zip.file(path, code);
      const readme = [
        `# ${payload?.title ?? "Nexura AI project"}`,
        "",
        "Exported from Nexura AI.",
        `Entry file: \`${payload?.entry ?? paths[0]}\``,
        "",
        "Runtime packages used by the live preview: react, react-dom, lucide-react.",
      ].join("\n");
      zip.file("README.md", readme);
      const blob = await zip.generateAsync({ type: "blob" });
      const slug = (payload?.title ?? "nexura-project").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      downloadBlob(blob, `${slug || "nexura-project"}.zip`);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="w-52 shrink-0 overflow-auto border-r border-ink-200 bg-white/50 py-2">
        <div className="ds-label px-3 pb-1.5">{payload?.title ?? "Project"}</div>
        {tree.map((node) => (
          <TreeItem key={node.path} node={node} depth={0} active={current} changed={changed} onSelect={select} />
        ))}
        <button
          onClick={() => void downloadZip()}
          disabled={zipping}
          className="mx-2 mt-3 flex w-[calc(100%-16px)] items-center justify-center gap-1.5 rounded-md border border-ink-200 px-2 py-1.5 text-2xs text-ink-600 transition hover:border-[color:var(--color-iris)]/40 hover:text-ink-900 disabled:opacity-50"
        >
          <FileArchive className="h-3 w-3" />
          {zipping ? "Packaging…" : "Export project (.zip)"}
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-3 py-1.5">
          <span className="truncate font-mono text-xs text-ink-700">{current}</span>
          {current === payload?.entry && (
            <span className="rounded border border-ink-200 px-1 text-2xs uppercase tracking-wider text-ink-500">
              entry
            </span>
          )}
          {changed.has(current) && (
            <span className="rounded border border-[color:var(--color-iris)]/40 bg-[color:var(--color-iris)]/10 px-1 text-2xs uppercase tracking-wider text-ink-700">
              changed
            </span>
          )}

          <button
            onClick={() => setEditing((e) => !e)}
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-2xs transition",
              editing
                ? "border-[color:var(--color-iris)]/40 bg-[color:var(--color-iris)]/10 text-ink-900"
                : "border-ink-200 text-ink-500 hover:text-ink-900",
            )}
            title={editing ? "Switch to read-only highlighted view" : "Edit this file"}
          >
            <Pencil className="h-3 w-3" />
            {editing ? "Editing" : "Read-only"}
          </button>

          <button
            onClick={() => void copyFile()}
            className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-2xs text-ink-500 transition hover:text-ink-900"
            title="Copy this file"
          >
            <Copy className="h-3 w-3" />
            {copied ? "Copied" : "Copy"}
          </button>

          <button
            onClick={downloadFile}
            className="inline-flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1 text-2xs text-ink-500 transition hover:text-ink-900"
            title="Download this file"
          >
            <Download className="h-3 w-3" />
            File
          </button>

          <button
            onClick={() => setLiveEdit(!liveEdit)}
            title="Live sync: preview reloads as you type"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-2xs transition",
              liveEdit
                ? "border-[color:var(--color-iris)]/40 bg-[color:var(--color-iris)]/10 text-ink-900"
                : "border-ink-200 text-ink-500 hover:text-ink-900",
            )}
          >
            {liveEdit ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
            Live {liveEdit ? "on" : "off"}
          </button>

          <button
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              if (draft != null) updateFile(current, draft);
              setDraft(null);
            }}
            disabled={!dirty}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-2xs transition",
              dirty
                ? "border-[color:var(--color-iris)]/40 bg-[color:var(--color-iris)]/10 text-ink-900"
                : "border-ink-200 text-ink-400",
            )}
            title="Save this edit as a version you can roll back to"
          >
            <Save className="h-3 w-3" />
            Save version
          </button>
        </div>

        {editing ? (
          <textarea
            value={value}
            onChange={(e) => onEdit(e.target.value)}
            spellCheck={false}
            aria-label={`Edit ${current}`}
            className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-[1.6] text-ink-800 outline-none"
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <SyntaxHighlighter
              language={langFor(current)}
              style={oneLight}
              showLineNumbers
              wrapLongLines={false}
              customStyle={{
                margin: 0,
                background: "transparent",
                padding: "12px",
                fontSize: "11.5px",
                lineHeight: 1.6,
              }}
              lineNumberStyle={{ opacity: 0.35, fontSize: "10px" }}
            >
              {value}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
    </div>
  );
}
