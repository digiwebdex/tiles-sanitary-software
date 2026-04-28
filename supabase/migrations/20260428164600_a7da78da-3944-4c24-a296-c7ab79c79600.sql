DROP TRIGGER IF EXISTS ensure_dealer_admin_role_after_profile_insert ON public.profiles;
DROP TRIGGER IF EXISTS ensure_dealer_admin_role_after_profile_dealer_set ON public.profiles;
DROP FUNCTION IF EXISTS public.ensure_dealer_admin_role_for_new_dealer_account();

CREATE OR REPLACE FUNCTION public.assign_dealer_admin_role(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND p.dealer_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'User is not linked to a dealer';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'dealer_admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_dealer_admin_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_dealer_admin_role(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_dealer_admin_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_dealer_admin_role(uuid) TO service_role;