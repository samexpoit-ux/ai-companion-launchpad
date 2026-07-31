import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  ImageIcon,
  Sparkles,
  Download,
  Shuffle,
  Loader2,
  ArrowLeft,
  Wand2,
  Copy,
  Check,
} from "lucide-react";
import {
  buildPollUrl,
  POLL_MODELS,
  POLL_RATIOS,
  randomSeed,
  type PollModel,
  type PollRatio,
} from "@/lib/pollinations";

export const Route = createFileRoute("/image")({
  head: () => ({
    meta: [
      { title: "Nexus X AI — Image Studio · Free Unlimited Generation" },
      {
        name: "description",
        content:
          "Generate unlimited AI images free — powered by Pollinations (Flux). Photoreal, anime, 3D, cinematic — no signup, no limits.",
      },
      { property: "og:title", content: "Nexus X AI — Image Studio" },
      { property: "og:description", content: "Free unlimited AI image generation with Flux." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImageStudio,
});

interface GenItem {
  id: string;
  prompt: string;
  url: string;
  model: PollModel;
  ratio: PollRatio;
  seed: number;
  createdAt: number;
  loaded?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPollModel(value: unknown): value is PollModel {
  return typeof value === "string" && POLL_MODELS.some((m) => m.id === value);
}

function isPollRatio(value: unknown): value is PollRatio {
  return typeof value === "string" && POLL_RATIOS.some((r) => r.id === value);
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeGalleryItem(value: unknown): GenItem | null {
  if (!isRecord(value)) return null;
  if (typeof value.prompt !== "string" || !value.prompt.trim()) return null;
  if (typeof value.url !== "string" || !value.url.startsWith("https://image.pollinations.ai/")) {
    return null;
  }
  return {
    id: typeof value.id === "string" && value.id ? value.id : crypto.randomUUID(),
    prompt: value.prompt,
    url: value.url,
    model: isPollModel(value.model) ? value.model : "flux",
    ratio: isPollRatio(value.ratio) ? value.ratio : "1:1",
    seed: finiteNumber(value.seed, randomSeed()),
    createdAt: finiteNumber(value.createdAt, Date.now()),
    loaded: typeof value.loaded === "boolean" ? value.loaded : undefined,
  };
}

const SUGGESTIONS = [
  "A neon-lit cyberpunk alleyway at night, rain reflections, cinematic 35mm",
  "Editorial portrait of a woman in iridescent chrome couture, studio lighting",
  "Ultra-detailed macro shot of a dew-covered spider web at sunrise",
  "Isometric floating island with waterfalls and glowing crystals, 3D render",
  "Minimal Japanese ink painting of a lone mountain and crane, negative space",
];

function ImageStudio() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<PollModel>("flux");
  const [ratio, setRatio] = useState<PollRatio>("1:1");
  const [seed, setSeed] = useState<number>(() => randomSeed());
  const [enhance, setEnhance] = useState(true);
  const [items, setItems] = useState<GenItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("nx.image.gallery");
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      const safeItems = Array.isArray(parsed)
        ? parsed.map(normalizeGalleryItem).filter((item): item is GenItem => Boolean(item))
        : [];
      setItems(safeItems);
      if (safeItems.length === 0 && raw) localStorage.removeItem("nx.image.gallery");
    } catch {
      localStorage.removeItem("nx.image.gallery");
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("nx.image.gallery", JSON.stringify(items.slice(0, 48)));
    } catch {
      /* ignore */
    }
  }, [items]);

  const dims = useMemo(() => POLL_RATIOS.find((r) => r.id === ratio) ?? POLL_RATIOS[0], [ratio]);

  function generate() {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    const url = buildPollUrl({
      prompt: p,
      model,
      width: dims.w,
      height: dims.h,
      seed,
      enhance,
      nologo: true,
    });
    const item: GenItem = {
      id: crypto.randomUUID(),
      prompt: p,
      url,
      model,
      ratio,
      seed,
      createdAt: Date.now(),
    };
    setItems((prev) => [item, ...prev]);
    // release the button once the first pixel of the request is likely in flight
    setTimeout(() => setBusy(false), 400);
  }

  function reroll(item: GenItem) {
    const newSeed = randomSeed();
    setPrompt(item.prompt);
    setModel(item.model);
    setRatio(item.ratio);
    setSeed(newSeed);
    setTimeout(() => generate(), 50);
  }

  async function copyPrompt(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-dvh bg-[#eef1ff] text-ink-900 relative overflow-hidden">
      {/* Ambient iris blobs — match ChatWorkspace vibe */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[15%] left-[10%] h-[620px] w-[620px] rounded-full iris-drift"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-iris-deep) 45%, transparent), transparent 70%)",
          filter: "blur(120px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[35%] right-[15%] h-[440px] w-[440px] rounded-full iris-drift"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-iris-warm) 30%, transparent), transparent 70%)",
          filter: "blur(120px)",
          animationDelay: "-10s",
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between border-b border-ink-200 px-4 py-3 sm:px-6"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.75), rgba(255,255,255,0.35))", backdropFilter: "blur(16px)" }}>
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white/60 px-3 py-1.5 text-xs text-ink-700 transition hover:border-ink-300 hover:text-ink-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Chat
          </Link>
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8 grid place-items-center rounded-lg overflow-hidden"
              style={{ background: "linear-gradient(135deg, var(--color-iris-deep), var(--color-iris-cyan))" }}>
              <ImageIcon className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-[13px] font-semibold tracking-tight" style={{ fontFamily: "'Sora', sans-serif" }}>
                Image Studio
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-500">
                Pollinations · Flux · Free & Unlimited
              </div>
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-[11px] text-ink-500 md:flex">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white/60 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            No API key · No limits
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[380px_1fr]">
        {/* Controls */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-ink-200 bg-white/60 p-4 backdrop-blur-xl">
            <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-ink-500">
              Prompt
            </label>
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  generate();
                }
              }}
              placeholder="Describe your image in vivid detail..."
              rows={5}
              className="w-full resize-none rounded-lg border border-ink-200 bg-white/70 px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-500 focus:border-ink-300 focus:outline-none focus:ring-2 focus:ring-[color:var(--color-iris-cyan)]/30"
              style={{ fontFamily: "'Manrope', sans-serif" }}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setPrompt(s)}
                  className="rounded-md border border-ink-200 bg-white/60 px-2 py-1 text-[10px] text-ink-500 transition hover:border-ink-300 hover:text-ink-800"
                >
                  {s.slice(0, 32)}…
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white/60 p-4 backdrop-blur-xl space-y-4">
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-ink-500">
                Model
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {POLL_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    className={`rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                      model === m.id
                        ? "border-[color:var(--color-iris-cyan)]/40 bg-[color:var(--color-iris-cyan)]/[0.08] text-ink-900"
                        : "border-ink-200 bg-white/60 text-ink-600 hover:border-ink-300 hover:text-ink-900"
                    }`}
                  >
                    <div className="font-semibold">{m.label}</div>
                    <div className="mt-0.5 text-[10px] text-ink-500">{m.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-ink-500">
                Aspect ratio
              </label>
              <div className="flex flex-wrap gap-1.5">
                {POLL_RATIOS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRatio(r.id)}
                    className={`rounded-md border px-2.5 py-1.5 text-[11px] transition ${
                      ratio === r.id
                        ? "border-[color:var(--color-iris-cyan)]/40 bg-[color:var(--color-iris-cyan)]/[0.08] text-ink-900"
                        : "border-ink-200 bg-white/60 text-ink-600 hover:border-ink-300"
                    }`}
                  >
                    {r.id}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-[0.2em] text-ink-500">Seed</label>
                <button
                  onClick={() => setSeed(randomSeed())}
                  className="inline-flex items-center gap-1 text-[10px] text-ink-600 hover:text-ink-900"
                >
                  <Shuffle className="h-3 w-3" /> randomize
                </button>
              </div>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-ink-200 bg-white/70 px-3 py-1.5 font-mono text-xs text-ink-800 focus:border-ink-300 focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-ink-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enhance}
                onChange={(e) => setEnhance(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-ink-300 bg-white/70 accent-[color:var(--color-iris-cyan)]"
              />
              <Wand2 className="h-3 w-3 text-[color:var(--color-iris-cyan)]" />
              Auto-enhance prompt (LLM rewrite)
            </label>
          </div>

          <button
            onClick={generate}
            disabled={!prompt.trim() || busy}
            className="group relative w-full overflow-hidden rounded-2xl px-4 py-3.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background:
                "linear-gradient(135deg, var(--color-iris-deep), var(--color-iris-cyan) 60%, var(--color-iris-warm))",
              boxShadow: "0 20px 50px -20px color-mix(in oklab, var(--color-iris-cyan) 60%, transparent)",
            }}
          >
            <span className="relative z-10 inline-flex items-center justify-center gap-2">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {busy ? "Sending..." : "Generate"}
              <span className="ml-2 rounded-md bg-white/60 px-1.5 py-0.5 text-[10px] font-mono font-normal opacity-70">
                ⌘↵
              </span>
            </span>
          </button>

          <p className="text-center text-[10px] text-ink-500">
            Powered by <span className="text-ink-500">pollinations.ai</span> · Free & unlimited · No signup
          </p>
        </section>

        {/* Gallery */}
        <section>
          {items.length === 0 ? (
            <div className="grid h-full min-h-[60vh] place-items-center rounded-2xl border border-dashed border-ink-200 bg-white/[0.01]">
              <div className="text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl"
                  style={{ background: "linear-gradient(135deg, var(--color-iris-deep), var(--color-iris-cyan))" }}>
                  <ImageIcon className="h-7 w-7 text-white" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Sora', sans-serif" }}>
                  Your gallery is empty
                </h2>
                <p className="mt-2 max-w-md text-sm text-ink-500">
                  Write a prompt on the left and hit <span className="font-mono text-ink-700">Generate</span>.
                  Images render live from Pollinations — no key, no limits.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {items.map((it) => (
                <GalleryCard
                  key={it.id}
                  item={it}
                  onCopy={() => copyPrompt(it.prompt, it.id)}
                  copied={copied === it.id}
                  onReroll={() => reroll(it)}
                  onRemove={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function GalleryCard({
  item,
  onCopy,
  copied,
  onReroll,
  onRemove,
}: {
  item: GenItem;
  onCopy: () => void;
  copied: boolean;
  onReroll: () => void;
  onRemove: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const dims = POLL_RATIOS.find((r) => r.id === item.ratio) ?? POLL_RATIOS[0];
  const aspect = `${dims.w} / ${dims.h}`;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-ink-200 bg-white/70 backdrop-blur-xl">
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: aspect }}>
        {!loaded && !errored && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="absolute inset-0 animate-pulse"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in oklab, var(--color-iris-deep) 30%, #eef1ff), color-mix(in oklab, var(--color-iris-cyan) 20%, #eef1ff))",
              }}
            />
            <div className="relative z-10 flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-ink-700" />
              <span className="text-[10px] uppercase tracking-widest text-ink-600">Rendering…</span>
            </div>
          </div>
        )}
        {errored && (
          <div className="absolute inset-0 grid place-items-center bg-white/70">
            <div className="text-center text-xs text-ink-600">
              <p>Failed to load.</p>
              <button onClick={onReroll} className="mt-2 rounded border border-ink-300 px-2 py-1 text-[11px] hover:bg-ink-900/5">
                Retry
              </button>
            </div>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.prompt}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={`h-full w-full object-cover transition-all duration-700 ${loaded ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-lg scale-105"}`}
          loading="lazy"
        />
        {/* Floating actions */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-1.5 bg-gradient-to-b from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            download={`nexus-${item.seed}.png`}
            className="rounded-md border border-ink-200 bg-white/70 p-1.5 text-ink-800 backdrop-blur hover:bg-white/80 hover:text-ink-900"
            title="Download / open"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          <button
            onClick={onReroll}
            className="rounded-md border border-ink-200 bg-white/70 p-1.5 text-ink-800 backdrop-blur hover:bg-white/80 hover:text-ink-900"
            title="Re-roll with new seed"
          >
            <Shuffle className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRemove}
            className="rounded-md border border-ink-200 bg-white/70 px-2 py-1 text-[10px] text-ink-700 backdrop-blur hover:bg-white/80 hover:text-ink-900"
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="border-t border-ink-200 p-3">
        <p className="line-clamp-2 text-xs text-ink-700" style={{ fontFamily: "'Manrope', sans-serif" }}>
          {item.prompt}
        </p>
        <div className="mt-2 flex items-center justify-between text-[10px] text-ink-500">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-ink-200 bg-white/60 px-1.5 py-0.5 font-mono">{item.model}</span>
            <span className="rounded border border-ink-200 bg-white/60 px-1.5 py-0.5 font-mono">{item.ratio}</span>
            <span className="rounded border border-ink-200 bg-white/60 px-1.5 py-0.5 font-mono">seed {item.seed}</span>
          </div>
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:text-ink-800"
            title="Copy prompt"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}
