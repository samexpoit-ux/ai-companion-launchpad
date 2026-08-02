/**
 * Webhook actions that must not run in the browser: test pings and manual
 * replays. The endpoint secret stays server side — signing happens here.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const testInput = z.object({ webhookId: z.string().uuid() });

export const testWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Sign in to test a webhook.");

    const hook = await context.supabase
      .from("webhooks")
      .select("id,url,secret")
      .eq("id", data.webhookId)
      .maybeSingle();
    if (!hook.data) throw new Error("Webhook not found.");

    const { deliverToWebhook } = await import("@/lib/webhooks.server");
    const result = await deliverToWebhook(
      context.supabase,
      userId,
      hook.data as { id: string; url: string; secret: string },
      "test.ping",
      { message: "Test delivery from Nexura AI", at: new Date().toISOString() },
    );
    return result;
  });
