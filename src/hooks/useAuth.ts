import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type NexusProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  plan: string;
  monthly_credit_cents: number;
};

/** Reactive Supabase session for client components. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, loading, isAuthenticated: !!user };
}

/** Loads the signed-in user's profile row. Returns null while signed out. */
export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<NexusProfile | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let alive = true;
    supabase
      .from("profiles")
      .select("id, email, display_name, avatar_url, plan, monthly_credit_cents")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setProfile((data as NexusProfile) ?? null);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return profile;
}

export function displayNameOf(
  profile: NexusProfile | null,
  user: { email?: string | null } | null,
) {
  return (
    profile?.display_name ??
    (user?.email ? user.email.split("@")[0] : null) ??
    "Explorer"
  );
}
