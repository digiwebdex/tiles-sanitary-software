
-- Purchase Planning from Shortage — Batch 2 linkage table
-- Records that a specific purchase covered a specific shortage (sale_item),
-- so derived status can move from "open" → "planned" → "linked" → "partial" → "fulfilled".
-- A separate table (not a column on sale_items) supports many-to-many:
--   one purchase can cover multiple shortages, one shortage can be covered
--   by multiple purchases over time.

CREATE TABLE IF NOT EXISTS public.purchase_shortage_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL,
  purchase_id UUID NOT NULL,
  purchase_item_id UUID,
  planned_qty NUMERIC NOT NULL DEFAULT 0,
  link_type TEXT NOT NULL DEFAULT 'planned', -- 'planned' (draft) | 'received' (post-receive linkage)
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psl_dealer ON public.purchase_shortage_links(dealer_id);
CREATE INDEX IF NOT EXISTS idx_psl_sale_item ON public.purchase_shortage_links(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_psl_purchase ON public.purchase_shortage_links(purchase_id);

ALTER TABLE public.purchase_shortage_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users can view purchase_shortage_links"
  ON public.purchase_shortage_links FOR SELECT TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer admins can manage purchase_shortage_links"
  ON public.purchase_shortage_links FOR ALL TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'::app_role))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Subscription required for psl writes"
  ON public.purchase_shortage_links FOR INSERT TO authenticated
  WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to purchase_shortage_links"
  ON public.purchase_shortage_links FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Optional notes column on purchase_items so a draft created from shortage
-- can carry context like "From shortage of INV-123 (Acme Builders)".
ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS shortage_note TEXT;
