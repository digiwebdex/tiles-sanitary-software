CREATE OR REPLACE FUNCTION public.ensure_dealer_admin_role_for_new_dealer_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.dealer_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = NEW.id
     ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'dealer_admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_dealer_admin_role_after_profile_insert ON public.profiles;
CREATE TRIGGER ensure_dealer_admin_role_after_profile_insert
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_dealer_admin_role_for_new_dealer_account();

DROP TRIGGER IF EXISTS ensure_dealer_admin_role_after_profile_dealer_set ON public.profiles;
CREATE TRIGGER ensure_dealer_admin_role_after_profile_dealer_set
AFTER UPDATE OF dealer_id ON public.profiles
FOR EACH ROW
WHEN (OLD.dealer_id IS DISTINCT FROM NEW.dealer_id)
EXECUTE FUNCTION public.ensure_dealer_admin_role_for_new_dealer_account();