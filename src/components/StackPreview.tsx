import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Database, Globe, KeyRound, Layers, Route, Terminal } from "lucide-react";
import { injectTailwind } from "@/lib/preview-tailwind";
import {
  analyzeStack,
  pickTemplateForRender,
  renderServerTemplate,
  STACK_LABEL,
  type StackReport,
} from "@/lib/stack";

/**
 * Blueprint view for stacks the browser cannot execute (Laravel/PHP, Node APIs,
 * Python, SQL, Docker …). It renders what the project *is* — stack, routes,
 * schema, services, env, run commands — plus a static render of the server-side
 * templates so a full-stack site is still visually reviewable in the preview.
 */
export default function StackPreview({ files }: { files: Record<string, string> }) {
  const report = useMemo<StackReport>(() => analyzeStack(files), [files]);
  const templatePath = useMemo(() => pickTemplateForRender(files), [files]);
  const [mode, setMode] = useState<"render" | "blueprint">(templatePath ? "render" : "blueprint");
  const frameRef = useRef<HTMLIFrameElement>(null);

  const rendered = useMemo(() => {
    if (!templatePath) return null;
    const body = renderServerTemplate(files, templatePath);
    if (/<html[\s>]/i.test(body)) return body;
    return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..800&family=Space+Grotesk:wght@400..700&display=swap" rel="stylesheet" />
<style>html,body{margin:0;font-family:Inter,system-ui,sans-serif}</style>
</head><body>${body}</body></html>`;
  }, [files, templatePath]);

  useEffect(() => {
    if (mode !== "render") return;
    const frame = frameRef.current;
    if (!frame) return;
    const run = () => {
      const doc = frame.contentDocument;
      if (doc) void injectTailwind(doc);
    };
    if (frame.contentDocument?.readyState === "complete") run();
    frame.addEventListener("load", run);
    return () => frame.removeEventListener("load", run);
  }, [mode, rendered]);

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-200 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-900">
          <Layers className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />
          Full-stack project
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {report.kinds.map((kind) => (
            <span
              key={kind}
              className="rounded-full border border-ink-200 bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-700"
            >
              {STACK_LABEL[kind]}
            </span>
          ))}
        </div>
        {templatePath && (
          <div className="ml-auto flex items-center gap-0.5 rounded-full border border-ink-200 bg-ink-100 p-0.5">
            <button
              type="button"
              onClick={() => setMode("render")}
              className={`rounded-full px-2.5 py-1 text-2xs font-medium transition ${mode === "render" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900"}`}
            >
              Rendered page
            </button>
            <button
              type="button"
              onClick={() => setMode("blueprint")}
              className={`rounded-full px-2.5 py-1 text-2xs font-medium transition ${mode === "blueprint" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-900"}`}
            >
              Blueprint
            </button>
          </div>
        )}
      </div>

      {mode === "render" && rendered ? (
        <div className="relative min-h-0 flex-1">
          <iframe
            ref={frameRef}
            title="Server template preview"
            srcDoc={rendered}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border border-ink-200 bg-white/90 px-3 py-1.5 text-2xs text-ink-500">
            Static render of <span className="font-mono">{templatePath}</span> — server logic runs
            after you ship the project.
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Card icon={Route} title={`Routes & endpoints (${report.endpoints.length})`}>
              {report.endpoints.length === 0 ? (
                <Empty>No HTTP routes detected.</Empty>
              ) : (
                <ul className="divide-y divide-ink-200/70">
                  {report.endpoints.map((e) => (
                    <li key={`${e.method}-${e.path}`} className="flex items-center gap-2 py-1.5">
                      <span className="w-14 shrink-0 rounded bg-[color:var(--color-iris)]/12 px-1.5 py-px text-center text-2xs font-bold uppercase text-[color:var(--color-iris)]">
                        {e.method}
                      </span>
                      <code className="truncate text-xs text-ink-900">{e.path}</code>
                      <span className="ml-auto truncate text-2xs text-ink-500">{e.file}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card icon={Database} title={`Database tables (${report.tables.length})`}>
              {report.tables.length === 0 ? (
                <Empty>No SQL schema in this project.</Empty>
              ) : (
                <div className="space-y-2">
                  {report.tables.map((t) => (
                    <div key={t.name} className="rounded-lg border border-ink-200 p-2">
                      <div className="text-xs font-semibold text-ink-900">{t.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.columns.map((c) => (
                          <span
                            key={c.name}
                            className="rounded bg-ink-100 px-1.5 py-px text-2xs text-ink-700"
                            title={c.type}
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card icon={Boxes} title={`Containers (${report.services.length})`}>
              {report.services.length === 0 ? (
                <Empty>No Docker services declared.</Empty>
              ) : (
                <ul className="space-y-1.5">
                  {report.services.map((s) => (
                    <li key={s.name} className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-ink-900">{s.name}</span>
                      {s.image && <code className="text-2xs text-ink-500">{s.image}</code>}
                      {s.ports.length > 0 && (
                        <span className="ml-auto text-2xs text-ink-500">{s.ports.join(", ")}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card icon={KeyRound} title={`Environment (${report.envKeys.length})`}>
              {report.envKeys.length === 0 ? (
                <Empty>No env keys required.</Empty>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {report.envKeys.map((k) => (
                    <code
                      key={k}
                      className="rounded bg-ink-100 px-1.5 py-px text-2xs text-ink-700"
                    >
                      {k}
                    </code>
                  ))}
                </div>
              )}
            </Card>

            <Card icon={Terminal} title="Run it locally">
              {report.commands.length === 0 ? (
                <Empty>Nothing to run — this project is static.</Empty>
              ) : (
                <ol className="space-y-1">
                  {report.commands.map((c) => (
                    <li key={c}>
                      <code className="block rounded bg-ink-900/95 px-2 py-1 text-2xs text-white">
                        {c}
                      </code>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card icon={Globe} title="Languages">
              <div className="flex flex-wrap gap-1">
                {report.languages.map((l) => (
                  <span
                    key={l.label}
                    className="rounded-full border border-ink-200 px-2 py-0.5 text-2xs text-ink-700"
                  >
                    {l.label} · {l.files}
                  </span>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Route;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-3">
      <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-900">
        <Icon className="h-3.5 w-3.5 text-[color:var(--color-iris)]" />
        {title}
      </h3>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-ink-500">{children}</p>
);
