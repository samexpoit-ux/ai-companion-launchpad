/**
 * Authenticated fetch for the app's own API routes.
 *
 * Server routes (`/api/chat`, `/api/autofix`) enforce credits per user, so they
 * need the Supabase access token on every call. Keeping this in one helper
 * means no endpoint can accidentally be called anonymously.
 */
import { supabase } from "@/integrations/supabase/client";

export async function apiFetch(path: string, body: unknown): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
