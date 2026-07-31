/**
 * Database-backed chat persistence.
 *
 * Threads, messages and project links live in the backend (not localStorage),
 * so a refresh — or a different device — restores the exact same conversation.
 * Every read/write is scoped to the signed-in user by RLS; we also pass
 * `user_id` explicitly because the policies check it on insert.
 */
import { supabase } from "@/integrations/supabase/client";

export interface StoredMessage {
  id: string;
  clientId: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  tokens: number | null;
  latencyMs: number | null;
  createdAt: string;
}

export interface StoredThread {
  id: string;
  title: string;
  mode: string;
  projectId: string | null;
  lastMessageAt: string;
  createdAt: string;
}

function threadFromRow(row: {
  id: string;
  title: string;
  mode: string;
  project_id: string | null;
  last_message_at: string;
  created_at: string;
}): StoredThread {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    projectId: row.project_id,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

function messageFromRow(row: {
  id: string;
  client_id: string | null;
  role: string;
  content: string;
  model: string | null;
  tokens: number | null;
  latency_ms: number | null;
  created_at: string;
}): StoredMessage {
  return {
    id: row.id,
    clientId: row.client_id,
    role: row.role === "assistant" ? "assistant" : row.role === "system" ? "system" : "user",
    content: row.content,
    model: row.model,
    tokens: row.tokens,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  };
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** All threads for the signed-in user, newest activity first. */
export async function listThreads(): Promise<StoredThread[]> {
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id,title,mode,project_id,last_message_at,created_at")
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[chat-store] listThreads failed", error.message);
    return [];
  }
  return (data ?? []).map(threadFromRow);
}

export async function createThread(input?: {
  title?: string;
  mode?: string;
  projectId?: string | null;
}): Promise<StoredThread | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("chat_threads")
    .insert({
      user_id: userId,
      title: input?.title?.slice(0, 120) || "New chat",
      mode: input?.mode ?? "build",
      project_id: input?.projectId ?? null,
    })
    .select("id,title,mode,project_id,last_message_at,created_at")
    .single();
  if (error || !data) {
    console.error("[chat-store] createThread failed", error?.message);
    return null;
  }
  return threadFromRow(data);
}

export async function renameThread(threadId: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("chat_threads")
    .update({ title: title.slice(0, 120) })
    .eq("id", threadId);
  if (error) console.error("[chat-store] renameThread failed", error.message);
}

export async function touchThread(threadId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId);
  if (error) console.error("[chat-store] touchThread failed", error.message);
}

export async function deleteThread(threadId: string): Promise<void> {
  const { error } = await supabase.from("chat_threads").delete().eq("id", threadId);
  if (error) console.error("[chat-store] deleteThread failed", error.message);
}

/** Messages of one thread in chronological order. */
export async function listMessages(threadId: string): Promise<StoredMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id,client_id,role,content,model,tokens,latency_ms,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[chat-store] listMessages failed", error.message);
    return [];
  }
  return (data ?? []).map(messageFromRow);
}

/**
 * Persist one message. `clientId` is the in-memory id so a retry can never
 * write the same message twice (unique per thread in the database).
 */
export async function saveMessage(input: {
  threadId: string;
  clientId: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string | null;
  tokens?: number | null;
  latencyMs?: number | null;
}): Promise<StoredMessage | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("chat_messages")
    .upsert(
      {
        user_id: userId,
        thread_id: input.threadId,
        client_id: input.clientId,
        role: input.role,
        content: input.content,
        model: input.model ?? null,
        tokens: input.tokens ?? null,
        latency_ms: input.latencyMs ?? null,
      },
      { onConflict: "thread_id,client_id" },
    )
    .select("id,client_id,role,content,model,tokens,latency_ms,created_at")
    .single();
  if (error || !data) {
    console.error("[chat-store] saveMessage failed", error?.message);
    return null;
  }
  await touchThread(input.threadId);
  return messageFromRow(data);
}
