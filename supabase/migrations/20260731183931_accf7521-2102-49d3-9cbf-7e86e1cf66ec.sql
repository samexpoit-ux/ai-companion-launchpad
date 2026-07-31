CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- anon-visible policies must not depend on the admin helper
DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
CREATE POLICY "plans_anon_read" ON public.plans FOR SELECT TO anon USING (is_active);
CREATE POLICY "plans_auth_read" ON public.plans FOR SELECT TO authenticated USING (is_active OR public.is_admin());

DROP POLICY IF EXISTS "settings_public_read" ON public.platform_settings;
CREATE POLICY "settings_anon_read" ON public.platform_settings FOR SELECT TO anon USING (is_public);
CREATE POLICY "settings_auth_read" ON public.platform_settings FOR SELECT TO authenticated USING (is_public OR public.is_admin());