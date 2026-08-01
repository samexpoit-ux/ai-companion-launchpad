ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS suspended_by uuid;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check CHECK (status IN ('active','suspended'));

CREATE INDEX IF NOT EXISTS profiles_status_idx ON public.profiles(status);

-- Non-admins can never change their own account status.
CREATE OR REPLACE FUNCTION public.guard_profile_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
      OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason
      OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by)
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.status := OLD.status;
    NEW.suspended_at := OLD.suspended_at;
    NEW.suspended_reason := OLD.suspended_reason;
    NEW.suspended_by := OLD.suspended_by;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_profile_status ON public.profiles;
CREATE TRIGGER guard_profile_status
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_status();

-- Admin: suspend / reactivate an account.
CREATE OR REPLACE FUNCTION public.admin_set_user_status(
  _user_id uuid,
  _status text,
  _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  IF _status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'invalid status %', _status;
  END IF;

  UPDATE public.profiles SET
    status = _status,
    suspended_at = CASE WHEN _status = 'suspended' THEN now() ELSE NULL END,
    suspended_reason = CASE WHEN _status = 'suspended' THEN _reason ELSE NULL END,
    suspended_by = CASE WHEN _status = 'suspended' THEN auth.uid() ELSE NULL END,
    updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_table, target_id, target_user_id, details)
  VALUES (auth.uid(),
          CASE WHEN _status = 'suspended' THEN 'user.suspended' ELSE 'user.reactivated' END,
          'profiles', _user_id::text, _user_id,
          jsonb_build_object('reason', _reason));
END $$;

REVOKE ALL ON FUNCTION public.admin_set_user_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(uuid, text, text) TO authenticated;

-- Admin: grant extra credits to an account.
CREATE OR REPLACE FUNCTION public.admin_grant_credits(
  _user_id uuid,
  _credits numeric,
  _note text DEFAULT NULL
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_total numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  IF _credits IS NULL OR _credits = 0 THEN
    RAISE EXCEPTION 'credits must be non-zero';
  END IF;

  INSERT INTO public.user_settings (user_id, credits_total)
  VALUES (_user_id, GREATEST(0, _credits))
  ON CONFLICT (user_id) DO UPDATE
    SET credits_total = GREATEST(0, public.user_settings.credits_total + _credits),
        updated_at = now()
  RETURNING credits_total INTO new_total;

  INSERT INTO public.admin_audit_log (actor_id, action, target_table, target_id, target_user_id, details)
  VALUES (auth.uid(), 'user.credits_granted', 'user_settings', _user_id::text, _user_id,
          jsonb_build_object('credits', _credits, 'note', _note, 'new_total', new_total));

  RETURN new_total;
END $$;

REVOKE ALL ON FUNCTION public.admin_grant_credits(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(uuid, numeric, text) TO authenticated;

-- Suspended accounts cannot spend credits.
CREATE OR REPLACE FUNCTION public.assert_account_active(_user_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'suspended') THEN
    RAISE EXCEPTION 'account_suspended';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.assert_account_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_account_active(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';