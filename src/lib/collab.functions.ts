/**
 * Project sharing (server side).
 *
 * Invites are resolved by email against `profiles` with the admin client, so a
 * browser can never enumerate accounts. Only the thread owner may invite or
 * revoke — checked with the caller's own RLS-scoped client before writing.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const shareInput = z.object({
  threadId: z.string().uuid(),
  email: z.string().email("Enter the email of an existing Nexura account."),
  role: z.enum(["viewer", "editor"]).default("editor"),
});

/** Invite an existing account to collaborate on one project. */
export const shareThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => shareInput.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    if (!userId) throw new Error("Sign in to share a project.");

    // Ownership check runs as the caller, so RLS is the source of truth.
    const owned = await context.supabase
      .from("chat_threads")
      .select("id,user_id,title")
      .eq("id", data.threadId)
      .maybeSingle();
    if (!owned.data || owned.data.user_id !== userId) {
      throw new Error("Only the project owner can invite collaborators.");
    }

    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await supabaseAdmin
      .from("profiles")
      .select("id,email")
      .ilike("email", email)
      .maybeSingle();

    if (!target.data) {
      throw new Error("No Nexura account uses that email yet — ask them to sign up first.");
    }
    if (target.data.id === userId) throw new Error("You already own this project.");

    const { error } = await supabaseAdmin.from("thread_collaborators").upsert(
      {
        thread_id: data.threadId,
        user_id: target.data.id,
        email,
        role: data.role,
        invited_by: userId,
      },
      { onConflict: "thread_id,user_id" },
    );
    if (error) throw new Error(error.message);

    return { ok: true as const, email, role: data.role };
  });

const revokeInput = z.object({ threadId: z.string().uuid(), userId: z.string().uuid() });

/** Remove one collaborator from a project. */
export const revokeThreadAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => revokeInput.parse(data))
  .handler(async ({ data, context }) => {
    if (!context.userId) throw new Error("Sign in to manage sharing.");
    const { error } = await context.supabase
      .from("thread_collaborators")
      .delete()
      .eq("thread_id", data.threadId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
