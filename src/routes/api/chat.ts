import { apiErrorResponse, codeFromUpstream } from "@/lib/api-error";
import { createFileRoute } from "@tanstack/react-router";
import { resolveRoute, runWithFallback } from "@/lib/ai-gateway.server";
import { isPlanId } from "@/lib/plans";
import { actionForMode } from "@/lib/credits";
import { actualUsageCost } from "@/lib/credits";
import { systemPromptFor } from "@/lib/prompts";
import { newTraceId, recordTrace, type TraceAttempt } from "@/lib/request-trace.server";
import {
  CreditError,
  chargeRequest,
  creditErrorCode,
  finalizeRequestCost,
} from "@/lib/credit-guard.server";

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
          mode === "plan"
            ? ("reason" as const)
            : mode === "chat"
              ? ("chat" as const)
              : mode === "build"
                ? ("code" as const)
                : undefined;
        const traceId = newTraceId();
        const threadId = typeof body.threadId === "string" ? body.threadId : null;
        const attempts: TraceAttempt[] = [];
        const requestStarted = Date.now();

        // ---- server-side credit enforcement (before any provider call) ----
        let charge;
        try {
          charge = await chargeRequest(request, actionForMode(mode), {
            inputChars: lastUser?.content.length ?? 0,
            threadId,
          });
        } catch (err) {
          if (err instanceof CreditError) {
            await recordTrace(request, {
              traceId,
              endpoint: "chat",
              mode,
              attempts,
              status: "blocked",
              errorMessage: err.message,
              promptChars: lastUser?.content.length ?? 0,
              latencyMs: Date.now() - requestStarted,
              threadId,
            });
            return apiErrorResponse(creditErrorCode(err), "chat", err.message, {
              traceId,
              ...(err.remaining != null ? { remaining: err.remaining } : {}),
            });
          }
          throw err;
        }

        // The browser cannot grant itself a premium model by spoofing `plan`.
        // Route from the authoritative server-side plan returned by the guard.
        let route;
        try {
          route = resolveRoute(body.modelId, {
            prompt: lastUser?.content ?? "",
            task: forcedTask,
            plan: isPlanId(charge.plan) ? charge.plan : undefined,
          });
        } catch (err) {
          await finalizeRequestCost(request, charge.id, actionForMode(mode), { failed: true });
          const message = err instanceof Error ? err.message : "Model routing failed.";
          await recordTrace(request, {
            traceId,
            endpoint: "chat",
            mode,
            plan: charge.plan,
            attempts,
            status: "error",
            errorMessage: message,
            promptChars: lastUser?.content.length ?? 0,
            latencyMs: Date.now() - requestStarted,
            threadId,
          });
          return apiErrorResponse("no_provider", "chat", message, { traceId });
        }
        if ("error" in route) {
          await finalizeRequestCost(request, charge.id, actionForMode(mode), { failed: true });
          await recordTrace(request, {
            traceId,
            endpoint: "chat",
            mode,
            plan: charge.plan,
            attempts,
            status: "error",
            errorMessage: route.error,
            promptChars: lastUser?.content.length ?? 0,
            latencyMs: Date.now() - requestStarted,
            threadId,
          });
          return apiErrorResponse("no_provider", "chat", route.error, { traceId });
        }

        const started = Date.now();
        const cleanMessages = [
          { role: "system" as const, content: systemPromptFor(route.task) },
          ...normalizedMessages,
        ];
        const promptChars = cleanMessages.reduce((sum, m) => sum + m.content.length, 0);

        try {
          const { content, tokens, inputTokens, outputTokens, costUsd, upstream } =
            await runWithFallback(route, cleanMessages, (attempt) => attempts.push(attempt));
          const finalCharge = await finalizeRequestCost(request, charge.id, actionForMode(mode), {
            costUsd,
            inputTokens,
            outputTokens,
            upstream,
          });
          const balance = finalCharge ?? charge;
          const displayedCharge = charge.unlimited
            ? actualUsageCost(actionForMode(mode), { inputTokens, outputTokens })
            : balance.charged;
          await recordTrace(request, {
            traceId,
            endpoint: "chat",
            mode,
            task: route.task,
            plan: balance.plan,
            primaryModel: route.upstream,
            finalModel: upstream,
            attempts,
            status: "ok",
            promptChars,
            inputTokens,
            outputTokens,
            costUsd,
            creditsCharged: displayedCharge,
            latencyMs: Date.now() - started,
            threadId,
          });
          return Response.json({
            content,
            model: route.friendlyId,
            provider: "openrouter",
            upstream,
            task: route.task,
            traceId,
            tokens,
            inputTokens,
            outputTokens,
            costUsd,
            latencyMs: Date.now() - started,
            attempts,
            credits: {
              charged: displayedCharge,
              remaining: balance.remaining,
              total: balance.total,
              used: balance.used,
              plan: balance.plan,
            },
          });
        } catch (err) {
          await finalizeRequestCost(request, charge.id, actionForMode(mode), { failed: true });
          const e = err as Error & { status?: number };
          await recordTrace(request, {
            traceId,
            endpoint: "chat",
            mode,
            task: route.task,
            plan: charge.plan,
            primaryModel: route.upstream,
            attempts,
            status: "error",
            errorMessage: e.message,
            promptChars,
            latencyMs: Date.now() - started,
            threadId,
          });
          return apiErrorResponse(codeFromUpstream(e.status), "chat", e.message, {
            model: route.friendlyId,
            provider: "openrouter",
            traceId,
          });
        }

      },
    },
  },
});
