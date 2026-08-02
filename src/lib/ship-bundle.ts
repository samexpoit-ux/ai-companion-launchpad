/**
 * Turns the in-workspace virtual project into a real, runnable repository.
 *
 * The live preview only needs the source files; a downloaded zip, a GitHub repo
 * or a hosting deploy needs the scaffolding around them (package.json, Vite
 * config, entry HTML). Keeping that here means zip / GitHub / deploy all ship
 * byte-identical projects.
 */

export interface ShipPayload {
  title?: string;
  entry?: string;
  files: Record<string, string>;
}

export function slugify(name: string | undefined, fallback = "nexura-project"): string {
  const slug = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || fallback;
}

const MAIN = (entry: string) => `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./${entry.replace(/^src\//, "").replace(/\.(tsx|jsx|ts|js)$/, "")}";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;

const INDEX_HTML = (title: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
`;

const STYLES = `:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
`;

const PKG = (slug: string) => `{
  "name": "${slug}",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --host --port 4173"
  },
  "dependencies": {
    "lucide-react": "^0.462.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.1"
  }
}
`;

const README = (title: string, entry: string) => `# ${title}

Built with **Nexura AI**. Everything here is real, runnable source — no snippets to paste.

## Run locally

\`\`\`bash
npm install
npm run dev
\`\`\`

## Deploy

Any static host works (Vercel, Netlify, Cloudflare Pages, your own VPS):

\`\`\`bash
npm install && npm run build   # output in dist/
\`\`\`

On a VPS behind nginx, serve \`dist/\` as the site root with an SPA fallback:

\`\`\`nginx
root /var/www/${slugify(title)}/dist;
location / { try_files $uri /index.html; }
\`\`\`

Entry component: \`${entry}\`
`;

/** Project files plus the scaffolding needed to install, run and deploy them. */
export function buildShipFiles(payload: ShipPayload): Record<string, string> {
  const files = { ...payload.files };
  const paths = Object.keys(files);
  const entry = payload.entry || "src/App.tsx";
  const title = payload.title || "Nexura AI project";
  const slug = slugify(title);

  // Only scaffold a Vite/React app when the project actually contains a React
  // front end — Laravel, Node, Python or SQL-only projects ship as authored.
  const hasReact = paths.some((p) => /\.(tsx|jsx)$/.test(p));
  const isForeignStack =
    !hasReact &&
    paths.some((p) => /\.(php|py|go|rb|java|cs)$/.test(p) || p === "composer.json");

  if (!files[".gitignore"]) {
    files[".gitignore"] = isForeignStack
      ? "vendor\nnode_modules\n.env\nstorage/*.log\n"
      : "node_modules\ndist\n.env\n";
  }
  if (!files["README.md"]) files["README.md"] = README(title, entry);

  if (isForeignStack) return files;

  if (!files["package.json"]) files["package.json"] = PKG(slug);
  if (!files["index.html"]) files["index.html"] = INDEX_HTML(title);
  if (!files["vite.config.ts"]) files["vite.config.ts"] = VITE_CONFIG;
  if (!files["tsconfig.json"]) files["tsconfig.json"] = TSCONFIG;
  if (!files["src/styles.css"] && !files["src/index.css"]) files["src/styles.css"] = STYLES;
  if (!files["src/main.tsx"] && !files["src/main.jsx"]) files["src/main.tsx"] = MAIN(entry);

  return files;
}

