REVOKE ALL ON FUNCTION public.assign_dealer_admin_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_dealer_admin_role(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assign_dealer_admin_role(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assign_dealer_admin_role(uuid) TO service_role;