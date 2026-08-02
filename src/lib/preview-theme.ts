/**
 * Shared colour tokens for the live preview runtime.
 *
 * The product theme lives in `src/styles.css`. Generated preview documents run
 * inside an iframe with their own document, so they cannot inherit those tokens.
 * This module is the ONE place that mirrors the palette into the sandbox, so a
 * previewed artifact renders with the same colours as the surrounding app —
 * including standalone HTML/CSS/JS/Markdown previews that get no Tailwind.
 *
 * Keep the values in sync with the `:root` block of src/styles.css.
 */

export const PREVIEW_TOKENS_CSS = `
:root {
  color-scheme: light;

  /* Brand */
  --nx-primary: #3B82F6;
  --nx-primary-strong: #2563EB;
  --nx-primary-ink: #1D4ED8;
  --nx-primary-soft: #E8ECF1;
  --nx-primary-fg: #FFFFFF;

  /* Surfaces & text */
  --nx-bg: #FFFFFF;
  --nx-surface: #FAFBFC;
  --nx-surface-2: #E8ECF1;
  --nx-border: #D5DCE5;
  --nx-fg: #0B1220;
  --nx-muted: #64748B;
  --nx-muted-strong: #475569;

  /* Status */
  --nx-success: #059669;
  --nx-warning: #B45309;
  --nx-danger: #BE123C;
  --nx-premium: #7C3AED;

  /* Shape */
  --nx-radius: 12px;
  --nx-shadow: 0 2px 4px -2px rgb(16 24 37 / 0.08), 0 8px 20px -8px rgb(16 24 37 / 0.12);

  /* shadcn-compatible aliases so generated code using them still themes */
  --background: var(--nx-bg);
  --foreground: var(--nx-fg);
  --primary: var(--nx-primary);
  --primary-foreground: var(--nx-primary-fg);
  --muted: var(--nx-surface);
  --muted-foreground: var(--nx-muted);
  --border: var(--nx-border);
}

html, body { margin: 0; }
body {
  font-family: "DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--nx-bg);
  color: var(--nx-fg);
  -webkit-font-smoothing: antialiased;
}
a { color: var(--nx-primary-ink); }
::selection { background: color-mix(in srgb, var(--nx-primary) 24%, transparent); }
button {
  font: inherit;
  color: inherit;
  border-radius: calc(var(--nx-radius) - 4px);
}
input, select, textarea { font: inherit; color: inherit; }
`;

/** Base document styling for non-React previews (HTML/CSS/JS/Markdown). */
export const PREVIEW_DOC_CSS = `
body { padding: 24px; box-sizing: border-box; }
h1, h2, h3 { font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif; letter-spacing: -0.01em; }
pre, code { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background: var(--nx-surface); padding: 12px; border-radius: var(--nx-radius); overflow: auto; }
.demo-card {
  padding: 16px;
  border: 1px solid var(--nx-border);
  border-radius: var(--nx-radius);
  background: var(--nx-surface);
  margin-top: 12px;
  box-shadow: var(--nx-shadow);
}
`;

/** A `<style>` tag with the tokens, ready to inline into a preview document. */
export function previewStyleTag(extra = ""): string {
  return `<style>${PREVIEW_TOKENS_CSS}${PREVIEW_DOC_CSS}${extra}</style>`;
}
