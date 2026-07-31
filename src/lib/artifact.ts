/**
 * Multi-file artifact protocol.
 *
 * The model is asked to emit projects as:
 *
 *   <nexusArtifact id="todo-app" title="Todo App">
 *     <nexusAction type="file" filePath="src/App.tsx">...code...</nexusAction>
 *     <nexusAction type="file" filePath="src/components/Item.tsx">...code...</nexusAction>
 *   </nexusArtifact>
 *
 * `boltArtifact` / `boltAction` are accepted as aliases so pasted bolt.new-style
 * output also works.
 */

export interface ArtifactProject {
  id: string;
  title: string;
  files: Record<string, string>;
  entry: string;
  order: string[];
}

const ARTIFACT_RE =
  /<(nexusArtifact|boltArtifact)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const ACTION_RE =
  /<(nexusAction|boltAction)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

function attr(raw: string, name: string): string | undefined {
  const m = raw.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3]) : undefined;
}

function cleanCode(input: string): string {
  let code = input.replace(/\r\n/g, "\n");
  // Models often wrap the file body in a markdown fence anyway.
  code = code.replace(/^\s*```[a-zA-Z0-9+-]*\n/, "").replace(/\n?```\s*$/, "");
  return code.replace(/^\n+/, "").replace(/\s+$/, "") + "\n";
}

const ENTRY_PRIORITY = [
  "src/App.tsx",
  "src/App.jsx",
  "src/app.tsx",
  "App.tsx",
  "App.jsx",
  "src/index.tsx",
  "src/main.tsx",
  "index.tsx",
];

export function pickEntry(files: Record<string, string>, order: string[]): string {
  for (const candidate of ENTRY_PRIORITY) {
    if (files[candidate]) return candidate;
  }
  const renderable = order.find((p) => /\.(tsx|jsx)$/.test(p));
  if (renderable) return renderable;
  const js = order.find((p) => /\.(ts|js)$/.test(p));
  if (js) return js;
  return order[0] ?? "";
}

/** Extract every artifact found in an assistant message. */
export function parseArtifacts(text: string): ArtifactProject[] {
  const projects: ArtifactProject[] = [];
  ARTIFACT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = ARTIFACT_RE.exec(text))) {
    const head = m[2] ?? "";
    const body = m[3] ?? "";
    const files: Record<string, string> = {};
    const order: string[] = [];

    ACTION_RE.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = ACTION_RE.exec(body))) {
      const meta = a[2] ?? "";
      const type = (attr(meta, "type") ?? "file").toLowerCase();
      if (type !== "file") continue;
      const path = (attr(meta, "filePath") ?? attr(meta, "filepath") ?? "").trim().replace(/^\.?\//, "");
      if (!path) continue;
      if (!(path in files)) order.push(path);
      files[path] = cleanCode(a[3] ?? "");
    }

    if (order.length === 0) continue;

    projects.push({
      id: attr(head, "id") ?? `artifact-${projects.length + 1}`,
      title: attr(head, "title") ?? "Generated project",
      files,
      order,
      entry: pickEntry(files, order),
    });
  }

  return projects;
}

/** Remove artifact blocks from markdown so the chat bubble stays readable. */
export function stripArtifacts(text: string): string {
  return text.replace(ARTIFACT_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function hasArtifact(text: string): boolean {
  return /<(nexusArtifact|boltArtifact)\b/i.test(text);
}

export function langForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    tsx: "tsx",
    ts: "typescript",
    jsx: "jsx",
    js: "javascript",
    mjs: "javascript",
    css: "css",
    html: "html",
    json: "json",
    md: "markdown",
    mdx: "mdx",
  };
  return map[ext] ?? "text";
}

// ---------- module resolution for the local preview engine ----------

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

const EXTS = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json"];

/** Resolve a relative import specifier against the virtual file map. */
export function resolveModule(
  files: Record<string, string>,
  fromFile: string,
  specifier: string,
): string | null {
  const base = fromFile.split("/").slice(0, -1).join("/");
  const joined = normalize(specifier.startsWith("/") ? specifier : `${base}/${specifier}`);

  for (const ext of EXTS) {
    const candidate = `${joined}${ext}`;
    if (files[candidate] != null) return candidate;
  }
  for (const ext of EXTS.slice(1)) {
    const candidate = `${joined}/index${ext}`;
    if (files[candidate] != null) return candidate;
  }
  return null;
}

/** Resolve alias imports like "@/components/Foo" onto src/. */
export function resolveAlias(
  files: Record<string, string>,
  specifier: string,
): string | null {
  if (!specifier.startsWith("@/")) return null;
  const rest = specifier.slice(2);
  for (const prefix of ["src/", ""]) {
    const hit = resolveModule(files, "root.tsx", `./${prefix}${rest}`);
    if (hit) return hit;
  }
  return null;
}
