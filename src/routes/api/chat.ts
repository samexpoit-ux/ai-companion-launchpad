import { apiErrorResponse, codeFromUpstream } from "@/lib/api-error";
import { createFileRoute } from "@tanstack/react-router";
import { resolveRoute, runWithFallback } from "@/lib/ai-gateway.server";

interface IncomingMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatBody {
  messages?: IncomingMessage[];
  modelId?: string;
}

const SYSTEM_PROMPT = `You are Nexus X AI — a premium, precise coding and product intelligence assistant.
Respond in clean Markdown. Use fenced code blocks with language tags (tsx, ts, js, html, css, sql, bash, json)
whenever you include code. Prefer tables for comparisons and bullet lists for enumerations. Be concise, senior,
and opinionated.

MULTI-FILE PROJECTS — very important:
When the user asks you to build an app, page, component set, or anything that needs more than one file,
output the whole project as ONE artifact using exactly this format:

<nexusArtifact id="kebab-case-id" title="Short Project Title">
<nexusAction type="file" filePath="src/App.tsx">
...full file contents, no markdown fences...
</nexusAction>
<nexusAction type="file" filePath="src/components/Thing.tsx">
...full file contents...
</nexusAction>
</nexusArtifact>

Artifact rules:
- Always include an entry component at src/App.tsx with a default export.
- Write COMPLETE files, never diffs, placeholders, or "...rest of code".
- Do NOT wrap file contents in markdown code fences inside nexusAction.
- Use relative imports ("./components/Thing") or "@/..." aliases resolved from src/.
- Only these runtime packages exist in the live preview: react, react-dom, lucide-react.
  Style with inline styles or Tailwind utility classes. Never import UI libraries or fetch remote packages.
- Put a short plain-language explanation BEFORE the artifact, not inside it.
- For a single tiny snippet, a normal fenced code block is fine — reserve artifacts for real projects.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: ChatBody;
        try {
          body = (await request.json()) as ChatBody;
        } catch {
          return apiErrorResponse("invalid_json", "chat", "Invalid JSON body");
        }

        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) {
          return apiErrorResponse("missing_input", "chat", "No message was sent.");
        }

        const normalizedMessages = messages
          .filter((m) => m && typeof m.content === "string" && m.content.length > 0)
          .slice(-16)
          .map((m) => ({
            role:
              m.role === "assistant"
                ? ("assistant" as const)
                : m.role === "system"
                ? ("system" as const)
                : ("user" as const),
            content: m.content,
          }));

        const lastUser = [...normalizedMessages].reverse().find((m) => m.role === "user");
        const route = resolveRoute(body.modelId, { prompt: lastUser?.content ?? "" });
        if ("error" in route) {
          return apiErrorResponse("no_provider", "chat", route.error);
        }

        const started = Date.now();
        const cleanMessages = [
          { role: "system" as const, content: SYSTEM_PROMPT },
          ...normalizedMessages,
        ];

        try {
          const { content, tokens, upstream } = await runWithFallback(route, cleanMessages);
          return Response.json({
            content,
            model: route.friendlyId,
            provider: "openrouter",
            upstream,
            task: route.task,
            tokens,
            latencyMs: Date.now() - started,
          });
        } catch (err) {
          const e = err as Error & { status?: number };
          return apiErrorResponse(codeFromUpstream(e.status), "chat", e.message, {
            model: route.friendlyId,
            provider: "openrouter",
          });
        }
      },
    },
  },
});
