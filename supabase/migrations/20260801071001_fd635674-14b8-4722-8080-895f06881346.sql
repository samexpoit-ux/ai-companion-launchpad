ALTER TABLE public.credit_ledger
  ADD COLUMN IF NOT EXISTS cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upstream_model text;

CREATE OR REPLACE FUNCTION public.record_request_cost(
  _ledger_id uuid,
  _cost_usd numeric,
  _tokens integer,
  _upstream text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.credit_ledger
     SET cost_usd = GREATEST(0, COALESCE(_cost_usd, 0)),
         tokens = GREATEST(0, COALESCE(_tokens, 0)),
         upstream_model = COALESCE(NULLIF(_upstream, ''), upstream_model)
   WHERE id = _ledger_id
     AND user_id = auth.uid()
     AND credits > 0
     AND cost_usd = 0;
END;
$$;

REVOKE ALL ON FUNCTION public.record_request_cost(uuid, numeric, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_request_cost(uuid, numeric, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_request_cost(uuid, numeric, integer, text) TO service_role;