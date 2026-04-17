DROP POLICY IF EXISTS "Subscription required for referral_sources writes" ON public.referral_sources;
CREATE POLICY "Subscription required for referral_sources writes"
ON public.referral_sources FOR INSERT TO authenticated
WITH CHECK (has_active_subscription() AND dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Subscription required for sale_commissions writes" ON public.sale_commissions;
CREATE POLICY "Subscription required for sale_commissions writes"
ON public.sale_commissions FOR INSERT TO authenticated
WITH CHECK (has_active_subscription() AND dealer_id = get_user_dealer_id(auth.uid()));