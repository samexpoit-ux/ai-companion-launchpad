-- Trigger helpers must never be callable through the API.
REVOKE ALL ON FUNCTION public.guard_user_settings() FROM PUBLIC, anon, authenticated;

-- Self-downgrade is a signed-in-only action.
REVOKE ALL ON FUNCTION public.downgrade_to_free() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.downgrade_to_free() TO authenticated;

-- Enforce burst limits inside the spend routine itself.
CREATE OR REPLACE FUNCTION public.spend_credits(
  _action TEXT,
  _tier TEXT,
  _credits NUMERIC,
  _model TEXT DEFAULT NULL,
  _thread_id UUID DEFAULT NULL,
  _reason TEXT DEFAULT NULL,
  _user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target UUID := COALESCE(_user_id, auth.uid());
  s public.user_settings;
  spent NUMERIC;
  remaining NUMERIC;
  entry_id UUID;
  per_minute INT;
  per_hour INT;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF _user_id IS NOT NULL AND _user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF _credits IS NULL OR _credits < 0 THEN
    RAISE EXCEPTION 'invalid charge amount';
  END IF;

  -- Burst limits: stop scripted credit-farming loops before charging.
  SELECT count(*) INTO per_minute
  FROM public.credit_ledger
  WHERE user_id = target AND credits > 0 AND created_at > now() - INTERVAL '1 minute';
  IF per_minute >= 20 THEN
    RAISE EXCEPTION 'rate limited: too many requests in the last minute';
  END IF;

  SELECT count(*) INTO per_hour
  FROM public.credit_ledger
  WHERE user_id = target AND credits > 0 AND created_at > now() - INTERVAL '1 hour';
  IF per_hour >= 400 THEN
    RAISE EXCEPTION 'rate limited: hourly request limit reached';
  END IF;

  INSERT INTO public.user_settings (user_id) VALUES (target)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO s FROM public.user_settings WHERE user_id = target FOR UPDATE;

  IF s.period_start IS NULL OR s.period_start < date_trunc('month', now()) THEN
    UPDATE public.user_settings
       SET period_start = date_trunc('month', now()), updated_at = now()
     WHERE user_id = target
    RETURNING * INTO s;
  END IF;

  SELECT COALESCE(SUM(credits), 0) INTO spent
  FROM public.credit_ledger
  WHERE user_id = target AND created_at >= s.period_start;

  remaining := s.credits_total - spent;

  IF remaining < _credits THEN
    RAISE EXCEPTION 'insufficient credits: % remaining', GREATEST(remaining, 0);
  END IF;

  INSERT INTO public.credit_ledger (user_id, action, tier, credits, model, thread_id, reason)
  VALUES (target, _action, _tier, _credits, _model, _thread_id, _reason)
  RETURNING id INTO entry_id;

  RETURN jsonb_build_object(
    'id', entry_id,
    'charged', _credits,
    'plan', s.plan,
    'total', s.credits_total,
    'used', spent + _credits,
    'remaining', remaining - _credits
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spend_credits(TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_credits(TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, UUID) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.check_spend_rate(UUID);
