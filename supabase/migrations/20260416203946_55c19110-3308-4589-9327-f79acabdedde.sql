-- Pricing Tiers Batch 1: schema + RLS

-- 1. price_tiers
CREATE TABLE public.price_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_tiers_status_chk CHECK (status IN ('active','inactive')),
  CONSTRAINT price_tiers_dealer_name_unique UNIQUE (dealer_id, name)
);

CREATE INDEX idx_price_tiers_dealer ON public.price_tiers(dealer_id);

ALTER TABLE public.price_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users can view price_tiers"
  ON public.price_tiers FOR SELECT TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer admins can manage price_tiers"
  ON public.price_tiers FOR ALL TO authenticated
  USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role))
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Super admin full access to price_tiers"
  ON public.price_tiers FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE TRIGGER update_price_tiers_updated_at
  BEFORE UPDATE ON public.price_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. price_tier_items
CREATE TABLE public.price_tier_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES public.price_tiers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rate numeric NOT NULL CHECK (rate >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_tier_items_unique UNIQUE (tier_id, product_id)
);

CREATE INDEX idx_price_tier_items_dealer_tier_product
  ON public.price_tier_items(dealer_id, tier_id, product_id);
CREATE INDEX idx_price_tier_items_product ON public.price_tier_items(product_id);

ALTER TABLE public.price_tier_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users can view price_tier_items"
  ON public.price_tier_items FOR SELECT TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer admins can manage price_tier_items"
  ON public.price_tier_items FOR ALL TO authenticated
  USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role))
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Super admin full access to price_tier_items"
  ON public.price_tier_items FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE TRIGGER update_price_tier_items_updated_at
  BEFORE UPDATE ON public.price_tier_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. customers.price_tier_id
ALTER TABLE public.customers
  ADD COLUMN price_tier_id uuid REFERENCES public.price_tiers(id) ON DELETE SET NULL;

CREATE INDEX idx_customers_price_tier ON public.customers(price_tier_id);

-- 4. quotation_items snapshot columns
ALTER TABLE public.quotation_items
  ADD COLUMN rate_source text NOT NULL DEFAULT 'default',
  ADD COLUMN tier_id uuid REFERENCES public.price_tiers(id) ON DELETE SET NULL;

ALTER TABLE public.quotation_items
  ADD CONSTRAINT quotation_items_rate_source_chk
  CHECK (rate_source IN ('default','tier','manual'));

-- 5. sale_items snapshot columns
ALTER TABLE public.sale_items
  ADD COLUMN rate_source text NOT NULL DEFAULT 'default',
  ADD COLUMN tier_id uuid REFERENCES public.price_tiers(id) ON DELETE SET NULL;

ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_rate_source_chk
  CHECK (rate_source IN ('default','tier','manual'));