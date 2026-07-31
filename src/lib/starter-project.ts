import type { ArtifactProject } from "@/lib/artifact";

/**
 * A tiny multi-file React project used to boot the live workspace so the
 * preview/code/console panes are usable before the AI has produced anything.
 */
export function createStarterProject(): ArtifactProject {
  const files: Record<string, string> = {
    "src/App.jsx": `import "./styles.css";
import Card from "./components/Card.jsx";


const features = [
  { title: "Live preview", body: "Edit any file and see it render instantly." },
  { title: "Multi-file", body: "A real virtual project, not a single snippet." },
  { title: "Auto bug-fix", body: "Runtime errors are captured and patched." },
];

export default function App() {
  return (
    <main className="page">
      <h1>Nexus X Live Workspace</h1>
      <p className="lead">
        This is a starter project. Ask Nexus X to build something and it will
        replace these files.
      </p>
      <div className="grid">
        {features.map((f) => (
          <Card key={f.title} title={f.title} body={f.body} />
        ))}
      </div>
    </main>
  );
}
`,
    "src/components/Card.jsx": `export default function Card({ title, body }) {
  return (
    <article className="card">
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  );
}
`,
    "src/styles.css": `* { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f8fbff; color: #0f172a; }
.page { max-width: 780px; margin: 0 auto; padding: 48px 24px; }
h1 { font-size: 30px; letter-spacing: -0.02em; margin: 0 0 8px; }
.lead { color: #64748b; margin: 0 0 28px; line-height: 1.6; }
.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.card { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px 18px; box-shadow: 0 12px 30px -24px rgba(15,23,42,.5); }
.card h2 { font-size: 15px; margin: 0 0 6px; }
.card p { font-size: 13px; color: #64748b; margin: 0; line-height: 1.55; }
`,
  };

  return {
    id: "starter",
    title: "Starter project",
    files,
    entry: "src/App.jsx",
    order: ["src/App.jsx", "src/components/Card.jsx", "src/styles.css"],
  };
}
