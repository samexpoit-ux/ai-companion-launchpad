import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Role check for the signed-in account, used to gate the admin panel UI. */
export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (error) console.error("[admin] role check failed", error.message);
    setIsAdmin(Boolean(data));
    setLoading(false);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return { isAdmin, loading, refresh: check };
}
