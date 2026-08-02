/**
 * Client-side reads for project sharing and stars.
 *
 * All of these rely on RLS: a collaborator sees the threads they were invited
 * to, and stars are always per signed-in user.
 */
import { supabase } from "@/integrations/supabase/client";

export interface Collaborator {
  userId: string;
  email: string | null;
  role: "viewer" | "editor";
  createdAt: string;
}

export async function listCollaborators(threadId: string): Promise<Collaborator[]> {
  const { data, error } = await supabase
    .from("thread_collaborators")
    .select("user_id,email,role,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[collab] listCollaborators failed", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    email: row.email,
    role: row.role === "viewer" ? "viewer" : "editor",
    createdAt: row.created_at,
  }));
}

/** Thread ids the signed-in user was invited to (i.e. does not own). */
export async function listSharedThreadIds(): Promise<string[]> {
  const { data: me } = await supabase.auth.getUser();
  const uid = me.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("thread_collaborators")
    .select("thread_id")
    .eq("user_id", uid);
  if (error) return [];
  return (data ?? []).map((r) => r.thread_id);
}

export async function listStarredThreadIds(): Promise<string[]> {
  const { data, error } = await supabase.from("thread_stars").select("thread_id");
  if (error) {
    console.warn("[collab] stars unavailable", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.thread_id);
}

/** Star / unstar a project for the signed-in user only. */
export async function setThreadStar(threadId: string, starred: boolean): Promise<void> {
  const { data: me } = await supabase.auth.getUser();
  const uid = me.user?.id;
  if (!uid) return;
  const { error } = starred
    ? await supabase.from("thread_stars").upsert(
        { user_id: uid, thread_id: threadId },
        { onConflict: "user_id,thread_id" },
      )
    : await supabase.from("thread_stars").delete().eq("user_id", uid).eq("thread_id", threadId);
  if (error) console.warn("[collab] star write failed", error.message);
}
