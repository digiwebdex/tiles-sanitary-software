
-- Create delivery_items table
CREATE TABLE public.delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id),
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add delivery_no to deliveries
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS delivery_no text;

-- Enable RLS
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;

-- RLS policies matching deliveries pattern
CREATE POLICY "Dealer admins can manage delivery_items"
  ON public.delivery_items FOR ALL
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Dealer users can view delivery_items"
  ON public.delivery_items FOR SELECT
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Salesmen can create delivery_items"
  ON public.delivery_items FOR INSERT
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

CREATE POLICY "Subscription required for delivery_items writes"
  ON public.delivery_items FOR INSERT
  WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to delivery_items"
  ON public.delivery_items FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
