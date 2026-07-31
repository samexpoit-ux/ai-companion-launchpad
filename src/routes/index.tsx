import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Boxes, Gauge, ShieldCheck, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import nexusLogo from "@/assets/nexus-x-logo.png";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "Nexus X AI — Build, Preview and Auto-Fix Apps with AI" },
      {
        name: "description",
        content:
          "Nexus X AI routes every prompt to the right model automatically, generates multi-file projects, previews them live and fixes runtime errors for you.",
      },
      { property: "og:title", content: "Nexus X AI" },
      {
        property: "og:description",
        content:
          "Smart model routing, multi-file artifacts, live preview and automatic bug fixing in one workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const features = [
  {
    icon: Wand2,
    title: "Smart model routing",
    body: "No model picker. Every prompt is analysed and sent to the cheapest model that can do the job well.",
  },
  {
    icon: Boxes,
    title: "Multi-file artifacts",
    body: "Ask for an app and get a whole project — file tree, entry point and all — not a lonely snippet.",
  },
  {
    icon: Gauge,
    title: "Live preview",
    body: "Your project compiles and runs in the browser as you edit, with hot reloading and a real console.",
  },
  {
    icon: ShieldCheck,
    title: "Reviewed auto-fix",
    body: "Runtime errors trigger a background patch you review as a diff before it touches your files.",
  },
];

function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);


  return (
    <main
      className="min-h-dvh text-ink-800"
      style={{
        background:
          "linear-gradient(135deg, #FFFFFF 0%, #FAFBFC 40%, #EEF3FA 72%, #FFFFFF 100%)",
      }}
    >
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <img src={nexusLogo} alt="Nexus X AI logo" className="h-8 w-8 rounded-lg" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink-900">
            Nexus X AI
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/image">Image Studio</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-4xl px-5 pb-16 pt-14 text-center sm:pt-20">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-500 backdrop-blur">
          <Sparkles className="h-3 w-3 text-[color:var(--color-iris)]" />
          Automatic model routing
        </span>

        <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.08] tracking-tight text-ink-900 sm:text-6xl">
          Describe it once.
          <br />
          <span className="text-[color:var(--color-iris)]">Nexus X builds it.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-500">
          A full AI engineering workspace: multi-file project generation, an offline
          live preview engine, reviewable auto-fix patches and version history — with
          the right model picked for you on every single message.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">
              Start building free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/image">Try Image Studio</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-4 px-5 pb-20 sm:grid-cols-2">
        {features.map((feature) => (
          <article
            key={feature.title}
            className="rounded-2xl border border-ink-200 bg-white/70 p-5 shadow-[0_24px_70px_-50px_rgba(37,74,140,0.5)] backdrop-blur"
          >
            <feature.icon className="h-5 w-5 text-[color:var(--color-iris)]" />
            <h2 className="mt-3 font-display text-[15px] font-semibold tracking-tight text-ink-900">
              {feature.title}
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">
              {feature.body}
            </p>
          </article>
        ))}
      </section>

      <footer className="border-t border-ink-200 px-5 py-6 text-center text-[12px] text-ink-400">
        Nexus X AI · Developed by{" "}
        <span className="font-medium text-ink-600">Sam</span>
      </footer>
    </main>
  );
}
