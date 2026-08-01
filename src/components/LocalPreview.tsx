import { useEffect, useRef, useState } from "react";
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as LucideIcons from "lucide-react";
import { transform } from "@babel/standalone";
import { resolveAlias, resolveModule } from "@/lib/artifact";
import { DEVICE_WIDTH, usePreview, type PreviewDevice, type PreviewPayload } from "./preview-context";


/**
 * Offline-first preview engine.
 *
 * Runs entirely on our own origin: the snippet is transpiled in the browser with
 * Babel standalone and mounted into a same-origin iframe. No remote bundler, so
 * the preview keeps working even when third-party sandboxes are unreachable.
 */

const BASE_HTML = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; height: 100%; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #fff; color: #1B1A17; padding: 20px; box-sizing: border-box; }
  #root { min-height: 100%; }
</style>
</head><body><div id="root"></div></body></html>`;

const CSS_HTML = (css: string) => `<!doctype html><html><head><meta charset="utf-8" />
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#fff;color:#1B1A17;padding:24px;margin:0}
.demo-card{padding:16px;border:1px solid #E4EDFA;border-radius:12px;background:#F7FBFF;margin-top:12px}</style>
<style>${css}</style></head><body>
<h1>Heading 1</h1><h2>Heading 2</h2>
<p>The quick brown fox jumps over the lazy dog.</p>
<button>Button</button>
<div class="demo-card">Card surface</div>
</body></html>`;

const JS_HTML = (js: string) => `<!doctype html><html><head><meta charset="utf-8" />
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#fff;color:#1B1A17;padding:24px;margin:0}</style>
</head><body><div id="app"></div><script type="module">
try {
${js}
} catch (e) { console.error(e); document.body.innerHTML = '<pre style="color:#b91c1c;white-space:pre-wrap">' + (e && e.stack || e) + '</pre>'; }
</script></body></html>`;

const MD_HTML = (md: string) => `<!doctype html><html><head><meta charset="utf-8" />
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#fff;color:#1B1A17;padding:24px;margin:0;line-height:1.65}
pre{background:#F1F6FE;padding:12px;border-radius:10px;overflow:auto}</style></head>
<body><pre style="white-space:pre-wrap;background:transparent;padding:0">${md
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")}</pre></body></html>`;

function ensureDefaultExport(src: string): string {
  if (/\bexport\s+default\b/.test(src)) return src;
  const named = src.match(/export\s+(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/);
  if (named) return `${src}\n\nexport default ${named[1]};\n`;
  const any = src.match(/(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/);
  if (any) return `${src}\n\nexport default ${any[1]};\n`;
  return `${src}\n\nexport default function App(){ return null; }\n`;
}

const EXTERNALS: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": React,
  "react-dom": ReactDOMClient,
  "react-dom/client": ReactDOMClient,
  "lucide-react": LucideIcons,
};

function makeRequire() {
  return (id: string) => {
    if (id in EXTERNALS) return EXTERNALS[id];
    if (/\.(css|scss|sass|less)$/.test(id)) return {};
    throw new Error(
      `Module "${id}" is not available in the live preview. Available: react, react-dom, lucide-react.`,
    );
  };
}

function compileModule(path: string, source: string) {
  return transform(source, {
    filename: path,
    presets: [["react", { runtime: "classic" }], "typescript"],
    plugins: ["transform-modules-commonjs"],
  }).code;
}

/**
 * Evaluate a multi-file virtual project. Relative and `@/` imports resolve
 * against the artifact file map; CSS files are injected into the frame.
 */
function runProject(
  files: Record<string, string>,
  entry: string,
  doc: Document,
): Record<string, unknown> {
  const cache = new Map<string, Record<string, unknown>>();

  const load = (path: string): Record<string, unknown> => {
    const cached = cache.get(path);
    if (cached) return cached;

    const source = files[path] ?? "";

    if (/\.css$/.test(path)) {
      const style = doc.createElement("style");
      style.textContent = source;
      doc.head.appendChild(style);
      const empty = {};
      cache.set(path, empty);
      return empty;
    }
    if (/\.json$/.test(path)) {
      const parsed = JSON.parse(source || "{}") as Record<string, unknown>;
      cache.set(path, parsed);
      return parsed;
    }

    const out = compileModule(path, source);
    const mod: { exports: Record<string, unknown> } = { exports: {} };
    cache.set(path, mod.exports);

    const req = (id: string) => {
      if (id in EXTERNALS) return EXTERNALS[id];
      const resolved = resolveModule(files, path, id) ?? resolveAlias(files, id);
      if (resolved) return load(resolved);
      if (/\.(css|scss|sass|less)$/.test(id)) return {};
      throw new Error(`Module "${id}" is not available in the live preview (imported by ${path}).`);
    };

    // eslint-disable-next-line no-new-func
    const run = new Function("require", "module", "exports", "React", out ?? "");
    run(req, mod, mod.exports, React);
    cache.set(path, mod.exports);
    return mod.exports;
  };

  return load(entry);
}

function pickComponent(exports: Record<string, unknown>): React.ComponentType | undefined {
  const def = exports.default;
  if (typeof def === "function") return def as React.ComponentType;
  return Object.values(exports).find((v) => typeof v === "function") as React.ComponentType | undefined;
}


interface Props {
  payload: PreviewPayload;
  device: PreviewDevice;
  reloadKey: number;
}

export default function LocalPreview({ payload, device, reloadKey }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<ReactDOMClient.Root | null>(null);
  const { reportRuntimeError, reportConsole, setBuildError } = usePreview();
  const [compileError, setCompileError] = useState<string | null>(null);


  const isReact = payload.lang === "react" || payload.lang === "react-ts" || !!payload.files;

  // Non-React languages render as plain documents.
  const srcDoc = isReact
    ? BASE_HTML
    : payload.lang === "css"
      ? CSS_HTML(payload.code)
      : payload.lang === "html"
        ? payload.code
        : payload.lang === "mdx"
          ? MD_HTML(payload.code)
          : JS_HTML(payload.code);

  useEffect(() => {
    setCompileError(null);
    setBuildError(null);

    if (!isReact) return;
    const frame = frameRef.current;
    if (!frame) return;

    let cancelled = false;

    const mount = () => {
      if (cancelled) return;
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!win || !doc) return;

      // Mirror the host stylesheets so Tailwind classes render inside the frame.
      try {
        for (const node of Array.from(document.head.querySelectorAll("style, link[rel=stylesheet]"))) {
          const clone = node.cloneNode(true) as HTMLElement;
          if (clone instanceof HTMLLinkElement) clone.href = (node as HTMLLinkElement).href;
          doc.head.appendChild(clone);
        }
      } catch { /* ignore */ }

      // Pipe sandbox errors into the auto-fix loop.
      const frameConsole = (win as unknown as { console: Console }).console;
      for (const level of ["log", "info", "warn", "error"] as const) {
        const native = frameConsole[level].bind(frameConsole);
        frameConsole[level] = (...args: unknown[]) => {
          const message = args.map((a) => {
            if (a instanceof Error) return a.message;
            if (a && typeof a === "object") {
              try { return JSON.stringify(a); } catch { return String(a); }
            }
            return String(a);
          }).join(" ");
          reportConsole(level, message);
          if (level === "error") reportRuntimeError(message);
          native(...args);
        };
      }
      win.addEventListener("error", (e) => reportRuntimeError(String((e as ErrorEvent).message)));
      win.addEventListener("unhandledrejection", (e) =>
        reportRuntimeError(String((e as PromiseRejectionEvent).reason)),
      );

      const host = doc.getElementById("root");
      if (!host) return;

      try {
        let Component: React.ComponentType | undefined;

        if (payload.files && payload.entry) {
          const files = payload.files;
          let entry = payload.entry;
          Component = pickComponent(runProject(files, entry, doc));

          // Entry files like main.tsx only bootstrap; fall back to the App module.
          if (!Component) {
            const appPath = Object.keys(files).find((p) => /(^|\/)App\.(tsx|jsx)$/.test(p));
            if (appPath) {
              entry = appPath;
              Component = pickComponent(runProject(files, entry, doc));
            }
          }
        } else {
          const source = ensureDefaultExport(payload.code);
          const out = compileModule(payload.lang === "react-ts" ? "App.tsx" : "App.jsx", source);
          const module: { exports: Record<string, unknown> } = { exports: {} };
          // eslint-disable-next-line no-new-func
          const run = new Function("require", "module", "exports", "React", out ?? "");
          run(makeRequire(), module, module.exports, React);
          Component = pickComponent(module.exports);
        }

        if (!Component) throw new Error("No React component was exported from this project.");


        rootRef.current?.unmount();
        rootRef.current = ReactDOMClient.createRoot(host);
        rootRef.current.render(
          React.createElement(PreviewErrorBoundary, { onError: reportRuntimeError }, React.createElement(Component)),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setCompileError(message);
        setBuildError(message);
        reportRuntimeError(message);
      }

    };

    if (frame.contentDocument?.readyState === "complete") mount();
    frame.addEventListener("load", mount);
    return () => {
      cancelled = true;
      frame.removeEventListener("load", mount);
      const root = rootRef.current;
      rootRef.current = null;
      if (root) setTimeout(() => root.unmount(), 0);
    };
  }, [payload.code, payload.lang, payload.files, payload.entry, isReact, reloadKey, reportConsole, reportRuntimeError, setBuildError]);

  const width = DEVICE_WIDTH[device];

  const frame = (
    <iframe
      key={`${payload.lang}-${reloadKey}`}
      ref={frameRef}
      title="Live preview"
      srcDoc={srcDoc}
      className="h-full w-full border-0 bg-white"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );

  return (
    <div className="relative h-full w-full">
      {width ? (
        <div className="flex h-full w-full items-start justify-center overflow-auto bg-ink-100/60 p-4">
          <div
            className="h-full max-w-full overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[0_30px_80px_-40px_rgba(37,74,140,0.45)]"
            style={{ width }}
          >
            {frame}
          </div>
        </div>
      ) : (
        frame
      )}

      {compileError && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          Build failed — see the error overlay for details.
        </div>
      )}
    </div>
  );

}

class PreviewErrorBoundary extends React.Component<
  { onError: (m: string) => void; children?: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        "pre",
        { style: { color: "#b91c1c", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace" } },
        this.state.error,
      );
    }
    return this.props.children;
  }
}
