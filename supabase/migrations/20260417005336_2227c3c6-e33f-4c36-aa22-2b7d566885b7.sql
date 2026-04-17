
DROP POLICY IF EXISTS "Subscription required for psl writes" ON public.purchase_shortage_links;

CREATE POLICY "Subscription + dealer required for psl writes"
  ON public.purchase_shortage_links FOR INSERT TO authenticated
  WITH CHECK (
    has_active_subscription()
    AND dealer_id = get_user_dealer_id(auth.uid())
  );
