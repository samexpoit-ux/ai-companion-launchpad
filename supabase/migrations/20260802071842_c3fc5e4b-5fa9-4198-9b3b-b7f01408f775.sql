CREATE TABLE IF NOT EXISTS public.request_traces (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id text NOT NULL,
  user_id uuid,
  endpoint text NOT NULL,
  mode text,
  task text,
  plan text,
  primary_model text,
  final_model text,
  attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  fallback_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  error_message text,
  prompt_chars integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  credits_charged numeric NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  thread_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS request_traces_created_at_idx ON public.request_traces (created_at DESC);
CREATE INDEX IF NOT EXISTS request_traces_trace_id_idx ON public.request_traces (trace_id);
CREATE INDEX IF NOT EXISTS request_traces_user_id_idx ON public.request_traces (user_id);

GRANT ALL ON public.request_traces TO service_role;
GRANT SELECT ON public.request_traces TO authenticated;

ALTER TABLE public.request_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read request traces" ON public.request_traces;
CREATE POLICY "admins read request traces"
ON public.request_traces FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));