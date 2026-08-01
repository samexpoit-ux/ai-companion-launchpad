CREATE OR REPLACE FUNCTION public.finalize_request_usage(
  _ledger_id uuid,
  _final_credits numeric,
  _cost_usd numeric,
  _input_tokens integer,
  _output_tokens integer,
  _upstream text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := auth.uid();
  settings_row public.user_settings;
  entry public.credit_ledger;
  spent numeric;
BEGIN
  IF target IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _final_credits IS NULL OR _final_credits < 0 THEN RAISE EXCEPTION 'invalid final charge'; END IF;

  SELECT * INTO entry FROM public.credit_ledger
   WHERE id = _ledger_id AND user_id = target FOR UPDATE;
  IF entry.id IS NULL THEN RAISE EXCEPTION 'ledger entry not found' USING ERRCODE = '42501'; END IF;
  IF entry.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'ledger entry was reversed' USING ERRCODE = '42501'; END IF;
  IF _final_credits > entry.credits THEN RAISE EXCEPTION 'final charge exceeds reservation' USING ERRCODE = '22003'; END IF;

  SELECT * INTO settings_row FROM public.user_settings WHERE user_id = target FOR UPDATE;
  UPDATE public.credit_ledger
     SET credits = _final_credits,
         cost_usd = GREATEST(0, COALESCE(_cost_usd, 0)),
         input_tokens = GREATEST(0, COALESCE(_input_tokens, 0)),
         output_tokens = GREATEST(0, COALESCE(_output_tokens, 0)),
         tokens = GREATEST(0, COALESCE(_input_tokens, 0)) + GREATEST(0, COALESCE(_output_tokens, 0)),
         upstream_model = COALESCE(NULLIF(_upstream, ''), upstream_model),
         updated_at = now()
   WHERE id = _ledger_id;

  SELECT COALESCE(SUM(credits), 0) INTO spent FROM public.credit_ledger
   WHERE user_id = target AND created_at >= settings_row.period_start;
  RETURN jsonb_build_object(
    'id', _ledger_id, 'charged', _final_credits, 'plan', settings_row.plan,
    'total', settings_row.credits_total, 'used', spent,
    'remaining', GREATEST(settings_row.credits_total - spent, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_request_usage(uuid,numeric,numeric,integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_request_usage(uuid,numeric,numeric,integer,integer,text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';