import { createFileRoute } from "@tanstack/react-router";
import { apiErrorResponse } from "@/lib/api-error";
import { CreditError, chargeRequest, creditErrorCode } from "@/lib/credit-guard.server";
import type { CreditAction } from "@/lib/credits";

/**
 * Charges cheap non-model actions (running the sandbox preview, exporting a
 * project). Model endpoints charge themselves; this route exists so those two
 * actions are also enforced server-side instead of trusted from the browser.
 * Only this small allow-list of actions is accepted.
 */
const ALLOWED: CreditAction[] = ["preview_run", "export"];

export const Route = createFileRoute("/api/spend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { action?: string; threadId?: string };
        try {
          body = (await request.json()) as { action?: string; threadId?: string };
        } catch {
          return apiErrorResponse("invalid_json", "client", "Invalid JSON body");
        }

        const action = ALLOWED.find((a) => a === body.action);
        if (!action) {
          return apiErrorResponse("bad_request", "client", "That action cannot be charged here.");
        }

        try {
          const charge = await chargeRequest(request, action, {
            threadId: typeof body.threadId === "string" ? body.threadId : null,
          });
          return Response.json({ credits: charge });
        } catch (err) {
          if (err instanceof CreditError) {
            return apiErrorResponse(creditErrorCode(err), "client", err.message, {
              ...(err.remaining != null ? { remaining: err.remaining } : {}),
            });
          }
          throw err;
        }
      },
    },
  },
});
