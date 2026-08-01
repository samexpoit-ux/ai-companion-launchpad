/**
 * Privileged admin user actions that cannot be expressed as RLS-guarded SQL.
 *
 * Deleting an account removes the auth identity itself, which only the service
 * role can do — so it runs here, behind an authenticated server function that
 * re-verifies the caller's admin role against the database (never a client
 * claim) before touching anything.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const deleteInput = z.object({ userId: z.string().uuid() });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteInput.parse(data))
  .handler(async ({ data, context }) => {
    const callerId = context.userId;
    if (!callerId) throw new Error("Sign in as an admin to delete accounts.");
    if (callerId === data.userId) throw new Error("You cannot delete your own admin account.");

    // Role check through the caller's own RLS-scoped client.
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Admin role required.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Never allow deleting another admin by accident.
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if ((targetRoles ?? []).some((r) => r.role === "admin")) {
      throw new Error("Revoke the admin role before deleting this account.");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: callerId,
      action: "user.deleted",
      target_table: "auth.users",
      target_id: data.userId,
      
      details: {},
    });

    return { ok: true as const };
  });
