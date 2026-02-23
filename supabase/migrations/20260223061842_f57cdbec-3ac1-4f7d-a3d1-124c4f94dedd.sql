CREATE TABLE public.campaign_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  campaign_name text NOT NULL,
  description text,
  gift_value numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  paid_amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer admins can manage campaign_gifts"
  ON public.campaign_gifts FOR ALL
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Dealer users can view campaign_gifts"
  ON public.campaign_gifts FOR SELECT
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Super admin full access to campaign_gifts"
  ON public.campaign_gifts FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Subscription required for campaign_gifts writes"
  ON public.campaign_gifts FOR INSERT
  WITH CHECK (has_active_subscription());