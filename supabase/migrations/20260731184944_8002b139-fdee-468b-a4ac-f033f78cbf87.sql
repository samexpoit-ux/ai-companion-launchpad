-- 1) Free plan allowance drops to 5 credits ---------------------------------
ALTER TABLE public.user_settings ALTER COLUMN credits_total SET DEFAULT 5;

UPDATE public.user_settings SET credits_total = 5, updated_at = now()
WHERE plan = 'free' AND credits_total <> 5;

UPDATE public.plans SET monthly_credits = 5, updated_at = now()
WHERE slug = 'free' AND monthly_credits <> 5;

-- 2) Clients may no longer write ledger rows directly ------------------------
DROP POLICY IF EXISTS "own ledger insert" ON public.credit_ledger;
REVOKE INSERT ON public.credit_ledger FROM authenticated;

-- 3) Balance snapshot for the calling user ----------------------------------
CREATE OR REPLACE FUNCTION public.credit_balance(_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
  s public.user_settings;
  spent numeric;
  period date;
BEGIN
  target := COALESCE(_user_id, auth.uid());
  IF target IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF target <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM public.user_settings WHERE user_id = target;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'plan', 'free', 'total', 5, 'used', 0, 'remaining', 5,
      'period_start', date_trunc('month', current_date)::date
    );
  END IF;

  period := GREATEST(s.period_start, date_trunc('month', current_date)::date);

  SELECT COALESCE(SUM(credits), 0) INTO spent
  FROM public.credit_ledger
  WHERE user_id = target AND created_at >= period;

  RETURN jsonb_build_object(
    'plan', s.plan,
    'total', s.credits_total,
    'used', spent,
    'remaining', GREATEST(0, s.credits_total - spent),
    'period_start', period
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_balance(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid) TO authenticated, service_role;

-- 4) Atomic, enforced spend -------------------------------------------------
CREATE OR REPLACE FUNCTION public.spend_credits(
  _action text,
  _tier text,
  _credits numeric,
  _model text DEFAULT NULL,
  _thread_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL,
  _user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
  s public.user_settings;
  spent numeric;
  period date;
  cost numeric;
  row_id uuid;
BEGIN
  target := COALESCE(_user_id, auth.uid());
  IF target IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF target <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  cost := ROUND(GREATEST(0, COALESCE(_credits, 0))::numeric, 3);
  IF cost > 1000 THEN
    RAISE EXCEPTION 'charge too large' USING ERRCODE = '22023';
  END IF;

  -- create-then-lock so concurrent requests serialise on one settings row
  INSERT INTO public.user_settings (user_id) VALUES (target)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO s FROM public.user_settings WHERE user_id = target FOR UPDATE;

  IF s.period_start < date_trunc('month', current_date)::date THEN
    UPDATE public.user_settings
       SET period_start = date_trunc('month', current_date)::date, updated_at = now()
     WHERE user_id = target
     RETURNING * INTO s;
  END IF;

  period := s.period_start;

  SELECT COALESCE(SUM(credits), 0) INTO spent
  FROM public.credit_ledger
  WHERE user_id = target AND created_at >= period;

  IF spent + cost > s.credits_total THEN
    RAISE EXCEPTION 'insufficient credits: % remaining, % required',
      GREATEST(0, s.credits_total - spent), cost
      USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.credit_ledger (user_id, action, tier, credits, model, thread_id, reason)
  VALUES (target, _action, _tier, cost, _model, _thread_id, _reason)
  RETURNING id INTO row_id;

  RETURN jsonb_build_object(
    'id', row_id,
    'charged', cost,
    'plan', s.plan,
    'total', s.credits_total,
    'used', spent + cost,
    'remaining', GREATEST(0, s.credits_total - spent - cost),
    'period_start', period
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spend_credits(text, text, numeric, text, uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.spend_credits(text, text, numeric, text, uuid, text, uuid) TO authenticated, service_role;

-- 5) Admin-only rollback ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_charge(_ledger_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original public.credit_ledger;
  row_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO original FROM public.credit_ledger WHERE id = _ledger_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'charge not found' USING ERRCODE = 'P0002';
  END IF;
  IF original.reversed_at IS NOT NULL OR original.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION 'charge already reversed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.credit_ledger (user_id, action, tier, credits, model, thread_id, reason, reversal_of)
  VALUES (original.user_id, original.action, original.tier, -original.credits,
          original.model, original.thread_id,
          COALESCE(_reason, 'rollback'), original.id)
  RETURNING id INTO row_id;

  UPDATE public.credit_ledger SET reversed_at = now(), updated_at = now() WHERE id = original.id;

  RETURN jsonb_build_object('id', row_id, 'refunded', original.credits, 'user_id', original.user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_charge(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rollback_charge(uuid, text) TO authenticated, service_role;