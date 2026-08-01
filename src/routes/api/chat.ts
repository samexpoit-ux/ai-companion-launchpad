import { apiErrorResponse, codeFromUpstream } from "@/lib/api-error";
import { createFileRoute } from "@tanstack/react-router";
import { resolveRoute, runWithFallback } from "@/lib/ai-gateway.server";
import { isPlanId } from "@/lib/plans";
import { actionForMode } from "@/lib/credits";
import { CreditError, chargeRequest, creditErrorCode, recordRequestCost } from "@/lib/credit-guard.server";

interface IncomingMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatBody {
  messages?: IncomingMessage[];
  modelId?: string;
  /** Selected pricing plan — caps which model tiers the router may use. */
  plan?: string;
  /** Composer mode, used to bias task detection ("build" | "chat" | "plan"). */
  mode?: string;
  /** Thread the charge belongs to, for the ledger. */
  threadId?: string;
}

const SYSTEM_PROMPT = `You are Nexura AI — a premium, precise coding and product intelligence assistant.
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
        const mode = (body.mode ?? "").toLowerCase();
        const forcedTask =
          mode === "plan" ? ("reason" as const) : mode === "chat" ? ("chat" as const) : undefined;
        const route = resolveRoute(body.modelId, {
          prompt: lastUser?.content ?? "",
          task: forcedTask,
          plan: isPlanId(body.plan) ? body.plan : undefined,
        });
        if ("error" in route) {
          return apiErrorResponse("no_provider", "chat", route.error);
        }

        // ---- server-side credit enforcement (before any provider call) ----
        let charge;
        try {
          charge = await chargeRequest(request, actionForMode(mode), {
            inputChars: lastUser?.content.length ?? 0,
            model: route.friendlyId,
            threadId: typeof body.threadId === "string" ? body.threadId : null,
          });
        } catch (err) {
          if (err instanceof CreditError) {
            return apiErrorResponse(creditErrorCode(err), "chat", err.message, {
              ...(err.remaining != null ? { remaining: err.remaining } : {}),
            });
          }
          throw err;
        }

        const started = Date.now();
        const cleanMessages = [
          { role: "system" as const, content: SYSTEM_PROMPT },
          ...normalizedMessages,
        ];

        try {
          const { content, tokens, costUsd, upstream } = await runWithFallback(route, cleanMessages);
          await recordRequestCost(request, charge.id, { costUsd, tokens, upstream });
          return Response.json({
            content,
            model: route.friendlyId,
            provider: "openrouter",
            upstream,
            task: route.task,
            tokens,
            costUsd,
            latencyMs: Date.now() - started,
            credits: {
              charged: charge.charged,
              remaining: charge.remaining,
              total: charge.total,
              used: charge.used,
              plan: charge.plan,
            },
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
