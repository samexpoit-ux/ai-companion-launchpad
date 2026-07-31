import { useEffect, useRef, useState } from "react";
import { Palette, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeState = { h: number; hCyan: number; hWarm: number; chroma: number };
const DEFAULT: ThemeState = { h: 217, hCyan: 213, hWarm: 224, chroma: 0.14 };
const STORAGE_KEY = "nexusx.theme.v4";

function applyTheme(t: ThemeState) {
  const r = document.documentElement.style;
  r.setProperty("--iris-h", String(t.h));
  r.setProperty("--iris-h-cyan", String(t.hCyan));
  r.setProperty("--iris-h-warm", String(t.hWarm));
  r.setProperty("--iris-chroma", String(t.chroma));
}

function loadTheme(): ThemeState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<ThemeState>;
    return { ...DEFAULT, ...p };
  } catch {
    return DEFAULT;
  }
}

const PRESETS: { name: string; theme: ThemeState }[] = [
  { name: "Cloud White",  theme: { h: 217, hCyan: 213, hWarm: 224, chroma: 0.14 } },
  { name: "Azure Glass",  theme: { h: 232, hCyan: 205, hWarm: 258, chroma: 0.13 } },
  { name: "Arctic Frost", theme: { h: 222, hCyan: 196, hWarm: 246, chroma: 0.10 } },
  { name: "Indigo Air",   theme: { h: 268, hCyan: 232, hWarm: 292, chroma: 0.15 } },
  { name: "Deep Ocean",   theme: { h: 235, hCyan: 195, hWarm: 285, chroma: 0.14 } },
  { name: "Warm Paper",   theme: { h: 40,  hCyan: 68,  hWarm: 22,  chroma: 0.15 } },
];

export function ThemePicker() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeState>(DEFAULT);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = loadTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  const update = (patch: Partial<ThemeState>) => {
    const next = { ...theme, ...patch };
    setTheme(next);
    applyTheme(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const reset = () => update(DEFAULT);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Theme picker"
        className="group relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-white/60 text-ink-600 transition hover:border-[color:var(--color-iris)]/50 hover:text-ink-900"
      >
        <span
          aria-hidden
          className="absolute inset-0 opacity-40 transition group-hover:opacity-80"
          style={{ background: "var(--iris-gradient)", filter: "blur(10px)" }}
        />
        <Palette className="relative h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] overflow-hidden rounded-2xl border border-ink-200 p-4 text-ink-700 shadow-[0_30px_80px_-20px_rgba(37,74,140,0.35)]"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(240,247,255,0.95))",
              backdropFilter: "blur(18px)",
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-2xs uppercase tracking-[0.22em] text-ink-500">Theme Studio</div>
                <div className="mt-0.5 text-sm font-semibold iris-text">Iridescent Chrome</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-ink-500 hover:bg-ink-900/5 hover:text-ink-900"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Live preview strip */}
            <div
              className="mb-4 h-10 rounded-lg"
              style={{ background: "var(--iris-gradient)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)" }}
            />

            <Slider label="Primary hue"  min={0} max={360} value={theme.h}     onChange={(v) => update({ h: v })} />
            <Slider label="Cool hue"     min={0} max={360} value={theme.hCyan} onChange={(v) => update({ hCyan: v })} />
            <Slider label="Warm hue"     min={0} max={360} value={theme.hWarm} onChange={(v) => update({ hWarm: v })} />
            <Slider label="Saturation"   min={4} max={22}  value={Math.round(theme.chroma * 100)} onChange={(v) => update({ chroma: v / 100 })} suffix="%" />

            <div className="mt-4">
              <div className="mb-2 text-2xs uppercase tracking-[0.22em] text-ink-500">Presets</div>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => update(p.theme)}
                    className={cn(
                      "group relative overflow-hidden rounded-lg border border-ink-200 p-2 text-left transition hover:border-ink-300",
                    )}
                    title={p.name}
                  >
                    <span
                      className="block h-8 w-full rounded-md"
                      style={{
                        background: `linear-gradient(120deg,
                          oklch(0.62 ${p.theme.chroma + 0.06} ${p.theme.h}),
                          oklch(0.78 ${p.theme.chroma} ${p.theme.h}),
                          oklch(0.84 ${p.theme.chroma - 0.02} ${p.theme.hCyan}),
                          oklch(0.72 ${p.theme.chroma + 0.04} ${p.theme.hWarm}))`,
                      }}
                    />
                    <span className="mt-1.5 block truncate text-2xs text-ink-500 group-hover:text-ink-900">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={reset}
              className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white/60 px-3 py-2 text-xs font-medium uppercase tracking-wider text-ink-600 transition hover:border-[color:var(--color-iris)]/40 hover:text-ink-900"
            >
              <RotateCcw className="h-3 w-3" /> Reset to Vapor Chrome
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Slider({
  label, min, max, value, onChange, suffix = "°",
}: { label: string; min: number; max: number; value: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-ink-500">{label}</span>
        <span className="font-mono text-ink-600">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="iris-range h-1.5 w-full cursor-pointer appearance-none rounded-full"
        style={{
          background: label === "Saturation"
            ? "linear-gradient(90deg, oklch(0.75 0.02 var(--iris-h)), oklch(0.75 0.22 var(--iris-h)))"
            : "linear-gradient(90deg, oklch(0.75 0.15 0), oklch(0.75 0.15 60), oklch(0.75 0.15 120), oklch(0.75 0.15 180), oklch(0.75 0.15 240), oklch(0.75 0.15 300), oklch(0.75 0.15 360))",
        }}
      />
    </div>
  );
}
