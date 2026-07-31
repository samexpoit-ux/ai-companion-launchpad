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
  privileged := (auth.uid() IS NULL) OR public.is_admin();
  IF privileged THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(monthly_credits, 5) INTO free_credits FROM public.plans WHERE slug = 'free';
  free_credits := COALESCE(free_credits, 5);

  IF TG_OP = 'INSERT' THEN
    NEW.user_id       := auth.uid();
    NEW.plan          := 'free';
    NEW.credits_total := free_credits;
    NEW.period_start  := COALESCE(NEW.period_start, date_trunc('month', now()));
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan AND NEW.plan <> 'free' THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, detail)
    VALUES (auth.uid(), 'blocked_plan_escalation', OLD.user_id,
            jsonb_build_object('from', OLD.plan, 'attempted', NEW.plan));
    RAISE EXCEPTION 'not allowed: plan changes require a completed payment';
  END IF;

  IF NEW.plan = 'free' AND NEW.plan IS DISTINCT FROM OLD.plan THEN
    NEW.credits_total := free_credits;
  ELSIF NEW.credits_total IS DISTINCT FROM OLD.credits_total THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_user_id, detail)
    VALUES (auth.uid(), 'blocked_credit_grant', OLD.user_id,
            jsonb_build_object('from', OLD.credits_total, 'attempted', NEW.credits_total));
    RAISE EXCEPTION 'not allowed: credit allowance is managed by the platform';
  END IF;

  NEW.period_start := OLD.period_start;
  NEW.user_id      := OLD.user_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_user_settings() FROM PUBLIC, anon, authenticated;
