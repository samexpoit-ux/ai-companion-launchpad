import { createFileRoute } from "@tanstack/react-router";
import LocalPreview from "@/components/LocalPreview";
import { PreviewProvider } from "@/components/preview-context";

const APP = `import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

function Nav() {
  return (
    <header className="flex items-center justify-between px-8 py-5 bg-amber-950/90 text-amber-50">
      <span className="text-xl font-bold tracking-tight">Ember Roast</span>
      <nav className="flex gap-6 text-sm"><Link to="/">Home</Link><Link to="/shop">Shop</Link></nav>
    </header>
  );
}

function Home() {
  return (
    <main className="min-h-screen bg-amber-50 text-amber-950">
      <section className="px-8 py-24 text-center">
        <h1 className="text-6xl font-bold tracking-tight">Crafted for those who savor</h1>
        <p className="mt-4 text-lg text-amber-800">Small-batch roasted specialty coffee.</p>
        <button className="mt-8 rounded-full bg-amber-900 px-8 py-3 text-amber-50 shadow-lg">Explore beans</button>
      </section>
      <section className="grid grid-cols-3 gap-6 px-8 pb-24">
        {["Ethiopia", "Colombia", "Sumatra"].map((n) => (
          <article key={n} className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold">{n}</h3>
            <p className="mt-2 text-sm text-amber-700">Floral · Citrus</p>
          </article>
        ))}
      </section>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<div className="p-10">Shop</div>} />
      </Routes>
    </BrowserRouter>
  );
}
`;

function DevPreviewProbe() {
  return (
    <PreviewProvider>
      <div className="h-dvh">
        <LocalPreview
          payload={{ code: APP, lang: "react-ts", files: { "App.tsx": APP }, entry: "App.tsx" }}
          device="desktop"
          reloadKey={1}
        />
      </div>
    </PreviewProvider>
  );
}

export const Route = createFileRoute("/dev-preview-probe")({
  component: DevPreviewProbe,
});
