/**
 * Tailwind engine for the live preview.
 *
 * Generated projects style themselves with Tailwind utility classes, but the
 * sandbox iframe has no build step and the product's own compiled stylesheet
 * only contains the classes *we* use — so any class the model invents renders
 * unstyled. We ship the standalone Tailwind browser compiler and run it inside
 * the frame: it scans the DOM, generates the matching CSS, and keeps watching
 * for mutations, so late React renders get styled too.
 */

let runtimePromise: Promise<string> | null = null;

/** Lazily fetch the Tailwind browser compiler source (~270 kB, preview only). */
export function loadTailwindRuntime(): Promise<string> {
  if (!runtimePromise) {
    runtimePromise = import("@/assets/vendor/tailwind-browser-4.3.3.js.txt?raw")
      .then((mod) => (mod as { default: string }).default)
      .catch(() => "");

  }
  return runtimePromise;
}

/** Fonts + a Tailwind theme bridge so previews match the product typography. */
export const PREVIEW_TAILWIND_CSS = `@import "tailwindcss";
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
`;

/**
 * Inject the Tailwind compiler into a preview document. Idempotent: repeated
 * mounts of the same frame reuse the already-running engine.
 */
export async function injectTailwind(doc: Document): Promise<void> {
  if (doc.querySelector("script[data-nexura-tailwind]")) return;
  const source = await loadTailwindRuntime();
  if (!source || doc.querySelector("script[data-nexura-tailwind]")) return;

  const config = doc.createElement("style");
  config.type = "text/tailwindcss";
  config.textContent = PREVIEW_TAILWIND_CSS;
  doc.head.appendChild(config);

  const script = doc.createElement("script");
  script.dataset["nexuraTailwind"] = "true";
  script.textContent = source;
  doc.head.appendChild(script);
}
