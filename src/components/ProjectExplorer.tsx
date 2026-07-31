import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, File as FileIcon, Folder, FolderOpen, Save, Zap, ZapOff } from "lucide-react";

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

function TreeItem({
  node,
  depth,
  active,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  active: string | null;
  onSelect: (p: string) => void;
}) {
  const [open, setOpen] = useState(true);

  if (!node.children) {
    const isActive = active === node.path;
    return (
      <button
        onClick={() => onSelect(node.path)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[11.5px] transition",
          isActive
            ? "bg-white text-ink-900 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-iris)_35%,transparent)]"
            : "text-ink-600 hover:bg-ink-900/5 hover:text-ink-900",
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <FileIcon className="h-3 w-3 shrink-0 opacity-60" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-[11.5px] text-ink-700 hover:bg-ink-900/5"
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        <ChevronRight className={cn("h-3 w-3 transition", open && "rotate-90")} />
        {open ? <FolderOpen className="h-3 w-3 opacity-70" /> : <Folder className="h-3 w-3 opacity-70" />}
        <span className="truncate font-medium">{node.name}</span>
      </button>
      {open &&
        node.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} active={active} onSelect={onSelect} />
        ))}
    </div>
  );
}

/** File explorer + inline editor for multi-file artifact projects. */
export default function ProjectExplorer() {
  const { payload, activeFile, setActiveFile, updateFile, liveUpdateFile, liveEdit, setLiveEdit } =
    usePreview();
  const files = payload?.files ?? {};
  const paths = useMemo(() => Object.keys(files), [files]);
  const tree = useMemo(() => buildTree(paths), [paths]);

  const current = activeFile && files[activeFile] != null ? activeFile : (payload?.entry ?? paths[0]);
  const [draft, setDraft] = useState<string | null>(null);
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

  return (
    <div className="flex h-full min-h-0">
      <div className="w-52 shrink-0 overflow-auto border-r border-ink-200 bg-white/50 py-2">
        <div className="ds-label px-3 pb-1.5">{payload?.title ?? "Project"}</div>
        {tree.map((node) => (
          <TreeItem key={node.path} node={node} depth={0} active={current} onSelect={select} />
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-1.5">
          <span className="truncate font-mono text-[11px] text-ink-700">{current}</span>
          {current === payload?.entry && (
            <span className="rounded border border-ink-200 px-1 text-[9.5px] uppercase tracking-wider text-ink-500">
              entry
            </span>
          )}

          <button
            onClick={() => setLiveEdit(!liveEdit)}
            title="Live sync: preview reloads as you type"
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] transition",
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
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] transition",
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
        <textarea
          value={value}
          onChange={(e) => onEdit(e.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[11.5px] leading-[1.6] text-ink-800 outline-none"
        />
      </div>
    </div>
  );
}

