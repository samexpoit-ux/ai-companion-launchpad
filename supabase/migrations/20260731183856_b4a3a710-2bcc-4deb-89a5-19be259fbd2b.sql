-- helper: admin check
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- ============================ plans ============================
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  monthly_credits numeric NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT USING (is_active OR public.is_admin());
CREATE POLICY "plans_admin_write" ON public.plans FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================ payments ============================
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_slug text,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'manual',
  provider_ref text,
  credits_granted numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_user_id_idx ON public.payments(user_id);
CREATE INDEX payments_created_at_idx ON public.payments(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_own_read" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "payments_admin_write" ON public.payments FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================ platform_settings ============================
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_public_read" ON public.platform_settings FOR SELECT USING (is_public OR public.is_admin());
CREATE POLICY "settings_admin_write" ON public.platform_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER platform_settings_set_updated_at BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================ admin_audit_log ============================
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_table text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log(created_at DESC);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_audit_read" ON public.admin_audit_log FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "admin_audit_insert" ON public.admin_audit_log FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- ============================ admin visibility on existing tables ============================
CREATE POLICY "profiles_admin_read" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "profiles_admin_write" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "projects_admin_read" ON public.projects FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "chat_threads_admin_read" ON public.chat_threads FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "chat_messages_admin_read" ON public.chat_messages FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "credit_ledger_admin_read" ON public.credit_ledger FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "credit_ledger_admin_write" ON public.credit_ledger FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "credit_audit_admin_read" ON public.credit_audit_log FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "user_settings_admin_read" ON public.user_settings FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "user_settings_admin_write" ON public.user_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "user_roles_admin_read" ON public.user_roles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "user_roles_admin_write" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================ seeds ============================
INSERT INTO public.plans (slug, name, description, price_cents, monthly_credits, features, sort_order) VALUES
  ('free', 'Free', 'Try Nexura AI with daily credits', 0, 30, '["Smart model routing","Chat + plan modes","Community support"]'::jsonb, 1),
  ('starter', 'Starter', 'For solo builders shipping real sites', 2000, 400, '["Coding tier access","Preview + export","Email support"]'::jsonb, 2),
  ('pro', 'Pro', 'For teams building continuously', 5000, 1200, '["Priority coding tier","Unlimited projects","Priority support"]'::jsonb, 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.platform_settings (key, value, is_public) VALUES
  ('brand', '{"name":"Nexura AI","tagline":"Build, preview and auto-fix apps with AI"}'::jsonb, true),
  ('signup', '{"enabled":true,"free_credits":30}'::jsonb, true),
  ('maintenance', '{"enabled":false,"message":""}'::jsonb, true),
  ('billing', '{"mode":"free","pay_as_you_go":false}'::jsonb, true)
ON CONFLICT (key) DO NOTHING;