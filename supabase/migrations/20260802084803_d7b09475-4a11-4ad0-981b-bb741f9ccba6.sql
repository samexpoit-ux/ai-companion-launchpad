CREATE OR REPLACE FUNCTION public.reserve_unlimited_usage(
  _action text,
  _tier text,
  _credits numeric,
  _model text DEFAULT NULL,
  _thread_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := auth.uid();
  entry_id uuid;
  settings_row public.user_settings;
  spent numeric;
BEGIN
  IF target IS NULL OR NOT public.is_admin(target) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;
  IF _credits IS NULL OR _credits < 0 THEN
    RAISE EXCEPTION 'invalid charge amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_settings (user_id) VALUES (target)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO settings_row FROM public.user_settings WHERE user_id = target;

  INSERT INTO public.credit_ledger (user_id, action, tier, credits, model, thread_id, reason)
  VALUES (target, _action, _tier, _credits, _model, _thread_id, COALESCE(_reason, 'unlimited admin usage'))
  RETURNING id INTO entry_id;

  SELECT COALESCE(SUM(credits), 0) INTO spent
  FROM public.credit_ledger
  WHERE user_id = target AND created_at >= settings_row.period_start;

  RETURN jsonb_build_object(
    'id', entry_id,
    'charged', _credits,
    'plan', settings_row.plan,
    'total', settings_row.credits_total,
    'used', spent,
    'remaining', GREATEST(settings_row.credits_total - spent, 0),
    'unlimited', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_unlimited_usage(text,text,numeric,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_unlimited_usage(text,text,numeric,text,uuid,text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';