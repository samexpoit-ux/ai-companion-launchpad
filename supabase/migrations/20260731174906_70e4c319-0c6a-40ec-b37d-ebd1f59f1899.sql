-- 1. Roles (separate table, never on profiles)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- 2. Ledger gets audit / reversal metadata
ALTER TABLE public.credit_ledger
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.credit_ledger(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

CREATE INDEX IF NOT EXISTS credit_ledger_user_created_idx ON public.credit_ledger (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_reversal_of_key ON public.credit_ledger (reversal_of) WHERE reversal_of IS NOT NULL;

DROP POLICY IF EXISTS "Admins can read every ledger row" ON public.credit_ledger;
CREATE POLICY "Admins can read every ledger row" ON public.credit_ledger
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Audit log for every credit event
CREATE TABLE IF NOT EXISTS public.credit_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ledger_id uuid REFERENCES public.credit_ledger(id) ON DELETE SET NULL,
  event text NOT NULL,
  action text,
  credits numeric NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.credit_audit_log TO authenticated;
GRANT ALL ON public.credit_audit_log TO service_role;
ALTER TABLE public.credit_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own audit log" ON public.credit_audit_log;
CREATE POLICY "Users can read their own audit log" ON public.credit_audit_log
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can append their own audit log" ON public.credit_audit_log;
CREATE POLICY "Users can append their own audit log" ON public.credit_audit_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND (actor_id IS NULL OR actor_id = auth.uid()));

CREATE INDEX IF NOT EXISTS credit_audit_log_user_created_idx ON public.credit_audit_log (user_id, created_at DESC);

-- 4. Log every ledger write automatically
CREATE OR REPLACE FUNCTION public.log_credit_ledger_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.credit_audit_log (user_id, actor_id, ledger_id, event, action, credits, details)
  VALUES (
    NEW.user_id,
    auth.uid(),
    NEW.id,
    CASE
      WHEN TG_OP = 'INSERT' AND NEW.reversal_of IS NOT NULL THEN 'rollback'
      WHEN TG_OP = 'INSERT' THEN 'charge'
      ELSE 'update'
    END,
    NEW.action,
    NEW.credits,
    jsonb_build_object('tier', NEW.tier, 'model', NEW.model, 'thread_id', NEW.thread_id, 'reason', NEW.reason, 'reversal_of', NEW.reversal_of)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS credit_ledger_audit ON public.credit_ledger;
CREATE TRIGGER credit_ledger_audit
AFTER INSERT OR UPDATE ON public.credit_ledger
FOR EACH ROW EXECUTE FUNCTION public.log_credit_ledger_event();

-- 5. Realtime for chat + ledger
ALTER TABLE public.chat_threads REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.credit_ledger REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_ledger;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;