
-- =============================================
-- 1. product_batches table
-- =============================================
CREATE TABLE public.product_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_no TEXT NOT NULL,
  lot_no TEXT,
  shade_code TEXT,
  caliber TEXT,
  box_qty NUMERIC NOT NULL DEFAULT 0 CHECK (box_qty >= 0),
  piece_qty NUMERIC NOT NULL DEFAULT 0 CHECK (piece_qty >= 0),
  sft_qty NUMERIC NOT NULL DEFAULT 0 CHECK (sft_qty >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'depleted')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_product_batches_dealer_product_status
  ON public.product_batches (dealer_id, product_id, status);

CREATE INDEX idx_product_batches_lookup
  ON public.product_batches (dealer_id, product_id, shade_code, caliber, lot_no);

-- RLS
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users can view product_batches"
  ON public.product_batches FOR SELECT TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer admins can manage product_batches"
  ON public.product_batches FOR ALL TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Salesmen can create product_batches"
  ON public.product_batches FOR INSERT TO authenticated
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

CREATE POLICY "Subscription required for product_batches writes"
  ON public.product_batches FOR INSERT TO authenticated
  WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to product_batches"
  ON public.product_batches FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- =============================================
-- 2. sale_item_batches junction table
-- =============================================
CREATE TABLE public.sale_item_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_item_id UUID NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.product_batches(id) ON DELETE RESTRICT,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  allocated_qty NUMERIC NOT NULL DEFAULT 0 CHECK (allocated_qty >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_item_batches_lookup
  ON public.sale_item_batches (sale_item_id, batch_id);

ALTER TABLE public.sale_item_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users can view sale_item_batches"
  ON public.sale_item_batches FOR SELECT TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer admins can manage sale_item_batches"
  ON public.sale_item_batches FOR ALL TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Salesmen can create sale_item_batches"
  ON public.sale_item_batches FOR INSERT TO authenticated
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

CREATE POLICY "Subscription required for sale_item_batches writes"
  ON public.sale_item_batches FOR INSERT TO authenticated
  WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to sale_item_batches"
  ON public.sale_item_batches FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- =============================================
-- 3. delivery_item_batches junction table
-- =============================================
CREATE TABLE public.delivery_item_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_item_id UUID NOT NULL REFERENCES public.delivery_items(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.product_batches(id) ON DELETE RESTRICT,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  delivered_qty NUMERIC NOT NULL DEFAULT 0 CHECK (delivered_qty >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_item_batches_lookup
  ON public.delivery_item_batches (delivery_item_id, batch_id);

ALTER TABLE public.delivery_item_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users can view delivery_item_batches"
  ON public.delivery_item_batches FOR SELECT TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer admins can manage delivery_item_batches"
  ON public.delivery_item_batches FOR ALL TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Salesmen can create delivery_item_batches"
  ON public.delivery_item_batches FOR INSERT TO authenticated
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

CREATE POLICY "Subscription required for delivery_item_batches writes"
  ON public.delivery_item_batches FOR INSERT TO authenticated
  WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to delivery_item_batches"
  ON public.delivery_item_batches FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- =============================================
-- 4. Add batch_id to purchase_items (nullable for backward compat)
-- =============================================
ALTER TABLE public.purchase_items
  ADD COLUMN batch_id UUID REFERENCES public.product_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_purchase_items_batch
  ON public.purchase_items (batch_id);
