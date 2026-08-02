CREATE TABLE IF NOT EXISTS public.thread_stars (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);
GRANT SELECT, INSERT, DELETE ON public.thread_stars TO authenticated;
GRANT ALL ON public.thread_stars TO service_role;
ALTER TABLE public.thread_stars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own stars" ON public.thread_stars;
CREATE POLICY "own stars" ON public.thread_stars FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.thread_collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thread_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_collaborators TO authenticated;
GRANT ALL ON public.thread_collaborators TO service_role;
ALTER TABLE public.thread_collaborators ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS thread_collaborators_user_idx ON public.thread_collaborators (user_id);

CREATE OR REPLACE FUNCTION public.thread_role(_thread UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.chat_threads t WHERE t.id = _thread AND t.user_id = auth.uid())
      THEN 'owner'
    ELSE (SELECT c.role FROM public.thread_collaborators c
          WHERE c.thread_id = _thread AND c.user_id = auth.uid() LIMIT 1)
  END
$$;
GRANT EXECUTE ON FUNCTION public.thread_role(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_edit_thread(_thread UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.thread_role(_thread) IN ('owner', 'editor')
$$;
GRANT EXECUTE ON FUNCTION public.can_edit_thread(UUID) TO authenticated;

DROP POLICY IF EXISTS "collaborators readable" ON public.thread_collaborators;
CREATE POLICY "collaborators readable" ON public.thread_collaborators FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.thread_role(thread_id) IS NOT NULL);
DROP POLICY IF EXISTS "owner manages collaborators" ON public.thread_collaborators;
CREATE POLICY "owner manages collaborators" ON public.thread_collaborators FOR ALL TO authenticated
  USING (public.thread_role(thread_id) = 'owner')
  WITH CHECK (public.thread_role(thread_id) = 'owner');

DROP POLICY IF EXISTS "shared thread read" ON public.chat_threads;
CREATE POLICY "shared thread read" ON public.chat_threads FOR SELECT TO authenticated
  USING (public.thread_role(id) IS NOT NULL);
DROP POLICY IF EXISTS "shared thread write" ON public.chat_threads;
CREATE POLICY "shared thread write" ON public.chat_threads FOR UPDATE TO authenticated
  USING (public.can_edit_thread(id)) WITH CHECK (public.can_edit_thread(id));

DROP POLICY IF EXISTS "shared messages read" ON public.chat_messages;
CREATE POLICY "shared messages read" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.thread_role(thread_id) IS NOT NULL);
DROP POLICY IF EXISTS "shared messages write" ON public.chat_messages;
CREATE POLICY "shared messages write" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_edit_thread(thread_id));

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Webhook',
  url TEXT NOT NULL,
  secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  events TEXT[] NOT NULL DEFAULT ARRAY['project.built', 'project.shipped', 'project.deployed'],
  active BOOLEAN NOT NULL DEFAULT true,
  last_status TEXT,
  last_delivery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own webhooks" ON public.webhooks;
CREATE POLICY "own webhooks" ON public.webhooks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  response_code INTEGER,
  error TEXT,
  duration_ms INTEGER,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own deliveries" ON public.webhook_deliveries;
CREATE POLICY "own deliveries" ON public.webhook_deliveries FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS webhook_deliveries_recent_idx
  ON public.webhook_deliveries (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.custom_domains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.chat_threads(id) ON DELETE SET NULL,
  domain TEXT NOT NULL,
  target TEXT,
  verification_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  last_check TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_domains TO authenticated;
GRANT ALL ON public.custom_domains TO service_role;
ALTER TABLE public.custom_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own domains" ON public.custom_domains;
CREATE POLICY "own domains" ON public.custom_domains FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);