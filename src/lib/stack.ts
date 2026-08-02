/**
 * Multi-stack project intelligence.
 *
 * The builder is not limited to React any more: a generated project can be a
 * Laravel/PHP app, an Express/Node API, a Python service, a SQL/Supabase schema,
 * a Docker deployment, or any mix of those. The browser sandbox can only *run*
 * web code, so for everything else we parse the project and render a blueprint
 * (stack, endpoints, tables, services, env, run commands) plus a best-effort
 * static render of server-side templates.
 */

export type StackKind =
  | "react"
  | "static-web"
  | "node"
  | "laravel"
  | "php"
  | "python"
  | "go"
  | "ruby"
  | "java"
  | "database"
  | "supabase"
  | "docker"
  | "mobile";

export interface Endpoint {
  method: string;
  path: string;
  handler?: string;
  file: string;
}

export interface TableColumn {
  name: string;
  type: string;
}

export interface TableSchema {
  name: string;
  columns: TableColumn[];
  file: string;
}

export interface DockerService {
  name: string;
  image?: string;
  ports: string[];
}

export interface StackReport {
  kinds: StackKind[];
  /** Something the iframe can actually run (React entry or an HTML document). */
  webEntry: string | null;
  /** True when the project also ships server / infra / db code. */
  hasBackend: boolean;
  endpoints: Endpoint[];
  tables: TableSchema[];
  services: DockerService[];
  envKeys: string[];
  commands: string[];
  languages: { label: string; files: number }[];
}

const LANG_LABEL: Record<string, string> = {
  tsx: "TypeScript React",
  ts: "TypeScript",
  jsx: "JavaScript React",
  js: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  vue: "Vue",
  svelte: "Svelte",
  php: "PHP",
  blade: "Blade",
  py: "Python",
  go: "Go",
  rb: "Ruby",
  java: "Java",
  kt: "Kotlin",
  rs: "Rust",
  cs: "C#",
  swift: "Swift",
  dart: "Dart",
  sql: "SQL",
  prisma: "Prisma",
  graphql: "GraphQL",
  yml: "YAML",
  yaml: "YAML",
  json: "JSON",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  md: "Markdown",
  sh: "Shell",
  bash: "Shell",
  env: "Env",
  toml: "TOML",
  dockerfile: "Dockerfile",
  xml: "XML",
  twig: "Twig",
  ejs: "EJS",
  hbs: "Handlebars",
};

export function extOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (/^dockerfile/i.test(base)) return "dockerfile";
  if (/^\.env/i.test(base)) return "env";
  if (/\.blade\.php$/i.test(base)) return "blade";
  return base.split(".").pop()?.toLowerCase() ?? "";
}

/** Prism grammar name for a path — used by the code viewer. */
export function prismLangFor(path: string): string {
  const ext = extOf(path);
  const map: Record<string, string> = {
    tsx: "tsx",
    ts: "typescript",
    jsx: "jsx",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    html: "markup",
    htm: "markup",
    xml: "markup",
    vue: "markup",
    svelte: "markup",
    md: "markdown",
    mdx: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    env: "bash",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    dockerfile: "docker",
    php: "php",
    blade: "php",
    twig: "markup",
    ejs: "markup",
    hbs: "markup",
    py: "python",
    go: "go",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    rs: "rust",
    cs: "csharp",
    swift: "swift",
    dart: "dart",
    graphql: "graphql",
    prisma: "prisma",
  };
  return map[ext] ?? "text";
}

const WEB_ENTRY_PRIORITY = [
  "src/App.tsx",
  "src/App.jsx",
  "src/app.tsx",
  "App.tsx",
  "App.jsx",
  "src/index.tsx",
  "src/main.tsx",
  "index.html",
  "public/index.html",
];

function pickWebEntry(files: Record<string, string>): string | null {
  for (const candidate of WEB_ENTRY_PRIORITY) if (files[candidate]) return candidate;
  const paths = Object.keys(files);
  const react = paths.find((p) => /\.(tsx|jsx)$/.test(p));
  if (react) return react;
  const html = paths.find((p) => /\.html?$/i.test(p));
  if (html) return html;
  return null;
}

// ---------------- parsers ----------------

/** CREATE TABLE … ( col type, … ) — Postgres/MySQL flavours. */
export function parseSqlTables(path: string, sql: string): TableSchema[] {
  const out: TableSchema[] = [];
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`"\w.]+)\s*\(([\s\S]*?)\)\s*;/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const name = (m[1] ?? "").replace(/[`"]/g, "");
    const body = m[2] ?? "";
    const columns: TableColumn[] = [];
    let depth = 0;
    let buffer = "";
    const lines: string[] = [];
    for (const ch of body) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        lines.push(buffer);
        buffer = "";
        continue;
      }
      buffer += ch;
    }
    if (buffer.trim()) lines.push(buffer);
    for (const raw of lines) {
      const line = raw.trim().replace(/\s+/g, " ");
      if (!line || /^(primary|foreign|unique|constraint|check|key|index)\b/i.test(line)) continue;
      const parts = line.split(" ");
      const col = (parts.shift() ?? "").replace(/[`"]/g, "");
      if (!col) continue;
      columns.push({ name: col, type: parts.join(" ").slice(0, 60) || "—" });
    }
    out.push({ name, columns, file: path });
  }
  return out;
}

/** Laravel routes, Express/Fastify routers, FastAPI/Flask decorators. */
export function parseEndpoints(path: string, code: string): Endpoint[] {
  const out: Endpoint[] = [];
  const push = (method: string, p: string, handler?: string) => {
    if (!p) return;
    out.push({ method: method.toUpperCase(), path: p.startsWith("/") ? p : `/${p}`, handler, file: path });
  };

  // Laravel: Route::get('/path', [Controller::class, 'index'])
  const laravel = /Route::(get|post|put|patch|delete|any|resource)\(\s*['"]([^'"]+)['"]\s*(?:,\s*\[?\s*([\w\\:]+)?)?/g;
  let m: RegExpExecArray | null;
  while ((m = laravel.exec(code))) push(m[1] ?? "get", m[2] ?? "", m[3]);

  // Express / Fastify / Hono: app.get('/path', handler)
  const express = /\b(?:app|router|api|server)\.(get|post|put|patch|delete|all)\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = express.exec(code))) push(m[1] ?? "get", m[2] ?? "");

  // FastAPI / Flask decorators
  const python = /@\w+\.(get|post|put|patch|delete|route)\(\s*['"]([^'"]+)['"]/g;
  while ((m = python.exec(code))) push(m[1] === "route" ? "GET" : (m[1] ?? "get"), m[2] ?? "");

  // PHP raw routers: $router->add('GET', '/path')
  const phpRouter = /->(?:add|map)\(\s*['"](GET|POST|PUT|PATCH|DELETE)['"]\s*,\s*['"]([^'"]+)['"]/gi;
  while ((m = phpRouter.exec(code))) push(m[1] ?? "GET", m[2] ?? "");

  return out;
}

/** docker-compose services (indentation-based, no YAML dependency). */
export function parseComposeServices(yaml: string): DockerService[] {
  const lines = yaml.split("\n");
  const services: DockerService[] = [];
  let inServices = false;
  let current: DockerService | null = null;
  let inPorts = false;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (/^services:\s*$/.test(line)) {
      inServices = true;
      continue;
    }
    if (inServices && /^\S/.test(line)) break;
    if (!inServices) continue;

    const service = line.match(/^ {2}([A-Za-z0-9._-]+):\s*$/);
    if (service) {
      if (current) services.push(current);
      current = { name: service[1] ?? "", ports: [] };
      inPorts = false;
      continue;
    }
    if (!current) continue;

    const image = line.match(/^ {4}image:\s*(.+)$/);
    if (image) current.image = (image[1] ?? "").trim().replace(/['"]/g, "");
    if (/^ {4}ports:\s*$/.test(line)) {
      inPorts = true;
      continue;
    }
    if (inPorts) {
      const port = line.match(/^ {6}-\s*['"]?([^'"\s]+)['"]?/);
      if (port) current.ports.push(port[1] ?? "");
      else if (/^ {4}\S/.test(line)) inPorts = false;
    }
  }
  if (current) services.push(current);
  return services;
}

function parseEnvKeys(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => (l.split("=")[0] ?? "").trim())
    .filter(Boolean);
}

// ---------------- report ----------------

export function analyzeStack(files: Record<string, string>): StackReport {
  const paths = Object.keys(files);
  const kinds = new Set<StackKind>();
  const endpoints: Endpoint[] = [];
  const tables: TableSchema[] = [];
  let services: DockerService[] = [];
  const envKeys = new Set<string>();
  const langCount = new Map<string, number>();

  for (const path of paths) {
    const code = files[path] ?? "";
    const ext = extOf(path);
    const label = LANG_LABEL[ext];
    if (label) langCount.set(label, (langCount.get(label) ?? 0) + 1);

    if (/\.(tsx|jsx)$/.test(path)) kinds.add("react");
    if (/\.html?$/i.test(path)) kinds.add("static-web");
    if (ext === "php" || ext === "blade") kinds.add("php");
    if (ext === "py") kinds.add("python");
    if (ext === "go") kinds.add("go");
    if (ext === "rb") kinds.add("ruby");
    if (ext === "java" || ext === "kt") kinds.add("java");
    if (ext === "dart" || ext === "swift") kinds.add("mobile");
    if (ext === "sql" || ext === "prisma") kinds.add("database");
    if (ext === "dockerfile" || /docker-compose\.ya?ml$/i.test(path)) kinds.add("docker");
    if (/^artisan$|(^|\/)(routes\/(web|api)\.php|app\/Http)/i.test(path)) kinds.add("laravel");
    if (/composer\.json$/.test(path) && /laravel\/framework/.test(code)) kinds.add("laravel");
    if (/(^|\/)(server|api|index|app)\.(ts|js|mjs)$/.test(path) && /express|fastify|hono|http\.createServer/.test(code))
      kinds.add("node");
    if (/supabase/i.test(path) || /supabase|auth\.uid\(\)/i.test(code.slice(0, 4000)))
      if (ext === "sql" || /supabase/i.test(path)) kinds.add("supabase");

    if (ext === "sql") tables.push(...parseSqlTables(path, code));
    if (/\.(php|ts|js|mjs|py|rb|go)$/.test(path) || ext === "php") endpoints.push(...parseEndpoints(path, code));
    if (/docker-compose\.ya?ml$/i.test(path)) services = parseComposeServices(code);
    if (ext === "env" || /\.env\.example$/i.test(path)) parseEnvKeys(code).forEach((k) => envKeys.add(k));
  }

  const has = (re: RegExp) => paths.some((p) => re.test(p));
  const commands: string[] = [];
  if (has(/composer\.json$/)) commands.push("composer install");
  if (kinds.has("laravel")) commands.push("php artisan migrate", "php artisan serve");
  else if (kinds.has("php")) commands.push("php -S localhost:8000 -t public");
  if (has(/package\.json$/)) commands.push("npm install", "npm run dev");
  if (has(/requirements\.txt$/)) commands.push("pip install -r requirements.txt");
  if (kinds.has("python") && !kinds.has("laravel")) commands.push("uvicorn main:app --reload");
  if (has(/go\.mod$/)) commands.push("go run .");
  if (has(/docker-compose\.ya?ml$/i)) commands.push("docker compose up -d --build");
  else if (kinds.has("docker")) commands.push("docker build -t app . && docker run -p 8080:8080 app");
  if (tables.length > 0 && !kinds.has("laravel")) commands.push("psql \"$DATABASE_URL\" -f schema.sql");

  const webEntry = pickWebEntry(files);
  const backendKinds: StackKind[] = [
    "node",
    "laravel",
    "php",
    "python",
    "go",
    "ruby",
    "java",
    "database",
    "supabase",
    "docker",
    "mobile",
  ];

  // Dedupe endpoints on method+path.
  const seen = new Set<string>();
  const uniqueEndpoints = endpoints.filter((e) => {
    const key = `${e.method} ${e.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    kinds: [...kinds],
    webEntry,
    hasBackend: backendKinds.some((k) => kinds.has(k)),
    endpoints: uniqueEndpoints.slice(0, 60),
    tables: tables.slice(0, 30),
    services,
    envKeys: [...envKeys].slice(0, 40),
    commands,
    languages: [...langCount.entries()]
      .map(([label, count]) => ({ label, files: count }))
      .sort((a, b) => b.files - a.files),
  };
}

export const STACK_LABEL: Record<StackKind, string> = {
  react: "React",
  "static-web": "HTML/CSS",
  node: "Node API",
  laravel: "Laravel",
  php: "PHP",
  python: "Python",
  go: "Go",
  ruby: "Ruby",
  java: "JVM",
  database: "SQL",
  supabase: "Supabase",
  docker: "Docker",
  mobile: "Mobile",
};

/**
 * Best-effort static render of a server-side template so a Laravel/PHP/Twig page
 * still *looks* like the finished site in the preview. Directives and PHP tags
 * are removed, `{{ $var }}` becomes readable text, and layout inheritance is
 * flattened by inlining the section bodies into the parent layout.
 */
export function renderServerTemplate(files: Record<string, string>, path: string): string {
  const source = files[path] ?? "";
  let html = source;

  // Flatten @extends('layouts.app') by pulling the layout and injecting @yield.
  const extend = html.match(/@extends\(\s*['"]([^'"]+)['"]\s*\)/);
  if (extend) {
    const target = (extend[1] ?? "").replace(/\./g, "/");
    const layoutPath = Object.keys(files).find((p) => p.includes(`${target}.blade.php`));
    if (layoutPath) {
      const sections = new Map<string, string>();
      const sectionRe = /@section\(\s*['"]([^'"]+)['"]\s*\)([\s\S]*?)@endsection/g;
      let s: RegExpExecArray | null;
      while ((s = sectionRe.exec(html))) sections.set(s[1] ?? "", s[2] ?? "");
      let layout = files[layoutPath] ?? "";
      layout = layout.replace(/@yield\(\s*['"]([^'"]+)['"](?:\s*,[^)]*)?\)/g, (_all, name: string) =>
        sections.get(name) ?? "",
      );
      html = layout;
    }
  }

  // Inline @include('partials.header')
  html = html.replace(/@include\(\s*['"]([^'"]+)['"][^)]*\)/g, (_all, name: string) => {
    const target = name.replace(/\./g, "/");
    const partial = Object.keys(files).find((p) => p.includes(`${target}.blade.php`));
    return partial ? (files[partial] ?? "") : "";
  });

  html = html
    // PHP blocks and echo tags.
    .replace(/<\?=([\s\S]*?)\?>/g, "")
    .replace(/<\?php[\s\S]*?\?>/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    // Blade / Twig / EJS control directives.
    .replace(/@(if|elseif|else|endif|foreach|endforeach|forelse|endforelse|for|endfor|while|endwhile|empty|isset|endisset|auth|endauth|guest|endguest|csrf|method|push|endpush|stack|once|endonce|php|endphp|section|endsection|show|vite)\b[^\n]*/g, "")
    .replace(/\{%[\s\S]*?%\}/g, "")
    .replace(/<%[-=]?[\s\S]*?%>/g, "")
    // `{{ $product->name }}` → "Product name"-ish readable text.
    .replace(/\{\{!?!?\s*([\s\S]*?)\s*!?!?\}\}/g, (_all, expr: string) => {
      const cleaned = String(expr)
        .replace(/^\$/, "")
        .replace(/\|\s*\w+.*$/, "")
        .split(/->|\.|::/)
        .pop() ?? "";
      const words = cleaned.replace(/[()'"$]/g, "").replace(/_/g, " ").trim();
      if (!words || /^\d+$/.test(words)) return words;
      return words.charAt(0).toUpperCase() + words.slice(1);
    });

  return html;
}

/** Any template/HTML file we can render statically for a visual preview. */
export function pickTemplateForRender(files: Record<string, string>): string | null {
  const paths = Object.keys(files);
  const preferred = [
    /resources\/views\/(home|index|welcome|landing)\.blade\.php$/i,
    /resources\/views\/[^/]+\.blade\.php$/i,
    /(^|\/)(index|home|landing)\.php$/i,
    /(^|\/)templates\/[^/]*\.(twig|html|ejs|hbs)$/i,
    /\.(twig|ejs|hbs)$/i,
    /\.php$/i,
  ];
  for (const re of preferred) {
    const hit = paths.find((p) => re.test(p));
    if (hit) return hit;
  }
  return null;
}
