// Minimal LCS-based line diff used by the patch review viewer.

export type DiffKind = "add" | "del" | "ctx";

export interface DiffLine {
  kind: DiffKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export interface FileDiff {
  path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

function splitLines(src: string) {
  return src.replace(/\r\n/g, "\n").split("\n");
}

/** Longest-common-subsequence table walk — fine for artifact-sized files. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;

  // Guard against pathological sizes.
  if (n * m > 4_000_000) {
    return [
      ...a.map((text, i) => ({ kind: "del" as const, text, oldNo: i + 1, newNo: null })),
      ...b.map((text, i) => ({ kind: "add" as const, text, oldNo: null, newNo: i + 1 })),
    ];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "ctx", text: a[i], oldNo: i + 1, newNo: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "del", text: a[i], oldNo: i + 1, newNo: null });
      i++;
    } else {
      out.push({ kind: "add", text: b[j], oldNo: null, newNo: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ kind: "del", text: a[i], oldNo: ++i, newNo: null });
  while (j < m) out.push({ kind: "add", text: b[j], oldNo: null, newNo: ++j });
  return out;
}

/** Collapse long unchanged runs so the viewer stays readable. */
export function collapseContext(lines: DiffLine[], padding = 3): DiffLine[] {
  const keep = new Set<number>();
  lines.forEach((l, idx) => {
    if (l.kind === "ctx") return;
    for (let k = idx - padding; k <= idx + padding; k++) if (k >= 0 && k < lines.length) keep.add(k);
  });
  if (keep.size === 0) return [];
  const out: DiffLine[] = [];
  let skipping = false;
  lines.forEach((l, idx) => {
    if (keep.has(idx)) {
      out.push(l);
      skipping = false;
    } else if (!skipping) {
      out.push({ kind: "ctx", text: "⋯", oldNo: null, newNo: null });
      skipping = true;
    }
  });
  return out;
}

export function diffFile(path: string, before: string | undefined, after: string | undefined): FileDiff {
  const status: FileDiff["status"] =
    before === undefined ? "added" : after === undefined ? "removed" : before === after ? "unchanged" : "modified";
  const lines = diffLines(before ?? "", after ?? "");
  return {
    path,
    status,
    additions: lines.filter((l) => l.kind === "add").length,
    deletions: lines.filter((l) => l.kind === "del").length,
    lines,
  };
}

export function diffProjects(
  before: Record<string, string>,
  after: Record<string, string>,
): FileDiff[] {
  const paths = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return paths
    .map((p) => diffFile(p, before[p], after[p]))
    .filter((d) => d.status !== "unchanged");
}
