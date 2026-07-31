-- ============================================================
-- Credit-system abuse hardening
-- ============================================================

-- 1) Guard privileged columns on user_settings ---------------
CREATE OR REPLACE FUNCTION public.guard_user_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_credits NUMERIC;
  privileged BOOLEAN;
BEGIN
  -- service_role / SQL migrations bypass; admins are allowed to manage plans.
  privileged := (current_setting('request.jwt.claims', true) IS NULL)
                OR (auth.uid() IS NULL)
                OR public.is_admin();

  IF privileged THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(monthly_credits, 5) INTO free_credits FROM public.plans WHERE slug = 'free';
  free_credits := COALESCE(free_credits, 5);

  IF TG_OP = 'INSERT' THEN
    -- Self-provisioning is always a free account, whatever the client asked for.
    NEW.user_id       := auth.uid();
    NEW.plan          := 'free';
    NEW.credits_total := free_credits;
    NEW.period_start  := COALESCE(OLD.period_start, now());
    RETURN NEW;
  END IF;

  -- UPDATE: users may only downgrade themselves to free; nothing else.
  IF NEW.plan IS DISTINCT FROM OLD.plan AND NEW.plan <> 'free' THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, detail)
    VALUES (auth.uid(), 'blocked_plan_escalation', OLD.user_id,
            jsonb_build_object('from', OLD.plan, 'attempted', NEW.plan));
    RAISE EXCEPTION 'not allowed: plan changes require a completed payment';
  END IF;

  IF NEW.plan = 'free' AND NEW.plan IS DISTINCT FROM OLD.plan THEN
    NEW.credits_total := free_credits;
  ELSE
    NEW.credits_total := OLD.credits_total;
  END IF;

  IF NEW.credits_total IS DISTINCT FROM OLD.credits_total THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, detail)
    VALUES (auth.uid(), 'blocked_credit_grant', OLD.user_id,
            jsonb_build_object('from', OLD.credits_total, 'attempted', NEW.credits_total));
    RAISE EXCEPTION 'not allowed: credit allowance is managed by the platform';
  END IF;

  -- Never let a client rewind the billing period to wipe recorded usage.
  NEW.period_start := OLD.period_start;
  NEW.user_id      := OLD.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_settings_guard ON public.user_settings;
CREATE TRIGGER user_settings_guard
  BEFORE INSERT OR UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_settings();

-- Users never need to delete their settings row.
REVOKE DELETE ON public.user_settings FROM authenticated;

-- 2) Burst limits inside the spend routine -------------------
CREATE OR REPLACE FUNCTION public.check_spend_rate(_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  per_minute INT;
  per_hour INT;
BEGIN
  SELECT count(*) INTO per_minute
  FROM public.credit_ledger
  WHERE user_id = _user_id AND credits > 0 AND created_at > now() - INTERVAL '1 minute';

  IF per_minute >= 20 THEN
    RAISE EXCEPTION 'rate limited: too many requests, slow down';
  END IF;

  SELECT count(*) INTO per_hour
  FROM public.credit_ledger
  WHERE user_id = _user_id AND credits > 0 AND created_at > now() - INTERVAL '1 hour';

  IF per_hour >= 400 THEN
    RAISE EXCEPTION 'rate limited: hourly request limit reached';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_spend_rate(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_spend_rate(UUID) TO service_role;

-- 3) Explicit, auditable plan switch for users ---------------
CREATE OR REPLACE FUNCTION public.downgrade_to_free()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target UUID := auth.uid();
  free_credits NUMERIC;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT COALESCE(monthly_credits, 5) INTO free_credits FROM public.plans WHERE slug = 'free';

  UPDATE public.user_settings
     SET plan = 'free', updated_at = now()
   WHERE user_id = target;

  INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, detail)
  VALUES (target, 'self_downgrade_free', target, '{}'::jsonb);

  RETURN jsonb_build_object('plan', 'free', 'total', COALESCE(free_credits, 5));
END;
$$;

GRANT EXECUTE ON FUNCTION public.downgrade_to_free() TO authenticated;
