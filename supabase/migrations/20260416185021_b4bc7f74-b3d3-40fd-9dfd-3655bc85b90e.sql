-- Add quotation sequence column
ALTER TABLE public.invoice_sequences
  ADD COLUMN IF NOT EXISTS next_quotation_no integer NOT NULL DEFAULT 1;

-- Quotations table
CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  quotation_no text NOT NULL,
  revision_no integer NOT NULL DEFAULT 0,
  parent_quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name_text text,
  customer_phone_text text,
  customer_address_text text,
  status text NOT NULL DEFAULT 'draft',
  quote_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date NOT NULL DEFAULT (CURRENT_DATE + 7),
  subtotal numeric NOT NULL DEFAULT 0,
  discount_type text NOT NULL DEFAULT 'flat',
  discount_value numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  terms_text text,
  converted_sale_id uuid,
  converted_at timestamptz,
  converted_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotations_status_check CHECK (status IN ('draft','active','expired','revised','converted','cancelled')),
  CONSTRAINT quotations_discount_type_check CHECK (discount_type IN ('flat','percent')),
  CONSTRAINT quotations_customer_required CHECK (customer_id IS NOT NULL OR COALESCE(customer_name_text,'') <> '')
);

CREATE INDEX idx_quotations_dealer ON public.quotations(dealer_id);
CREATE INDEX idx_quotations_status ON public.quotations(dealer_id, status);
CREATE INDEX idx_quotations_customer ON public.quotations(customer_id);
CREATE INDEX idx_quotations_parent ON public.quotations(parent_quotation_id);

-- Quotation items
CREATE TABLE public.quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  product_sku_snapshot text,
  unit_type text NOT NULL DEFAULT 'piece',
  per_box_sft numeric,
  quantity numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  discount_value numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  preferred_shade_code text,
  preferred_caliber text,
  preferred_batch_no text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotation_items_quotation ON public.quotation_items(quotation_id);
CREATE INDEX idx_quotation_items_dealer ON public.quotation_items(dealer_id);

-- updated_at trigger
CREATE TRIGGER trg_quotations_updated_at
BEFORE UPDATE ON public.quotations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- Quotations policies
CREATE POLICY "Dealer users can view quotations"
  ON public.quotations FOR SELECT TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer users can create quotations"
  ON public.quotations FOR INSERT TO authenticated
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_active_subscription());

CREATE POLICY "Dealer admins can update quotations"
  ON public.quotations FOR UPDATE TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Salesmen can update own draft quotations"
  ON public.quotations FOR UPDATE TO authenticated
  USING (
    dealer_id = get_user_dealer_id(auth.uid())
    AND has_role(auth.uid(), 'salesman'::app_role)
    AND created_by = auth.uid()
    AND status = 'draft'
  );

CREATE POLICY "Dealer admins can delete quotations"
  ON public.quotations FOR DELETE TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Salesmen can delete own draft quotations"
  ON public.quotations FOR DELETE TO authenticated
  USING (
    dealer_id = get_user_dealer_id(auth.uid())
    AND has_role(auth.uid(), 'salesman'::app_role)
    AND created_by = auth.uid()
    AND status = 'draft'
  );

CREATE POLICY "Super admin full access to quotations"
  ON public.quotations FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Quotation items policies
CREATE POLICY "Dealer users can view quotation_items"
  ON public.quotation_items FOR SELECT TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer users can create quotation_items"
  ON public.quotation_items FOR INSERT TO authenticated
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_active_subscription());

CREATE POLICY "Dealer users can update quotation_items"
  ON public.quotation_items FOR UPDATE TO authenticated
  USING (
    dealer_id = get_user_dealer_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.dealer_id = get_user_dealer_id(auth.uid())
        AND (
          has_role(auth.uid(), 'dealer_admin'::app_role)
          OR (q.created_by = auth.uid() AND q.status = 'draft')
        )
    )
  );

CREATE POLICY "Dealer users can delete quotation_items"
  ON public.quotation_items FOR DELETE TO authenticated
  USING (
    dealer_id = get_user_dealer_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.dealer_id = get_user_dealer_id(auth.uid())
        AND (
          has_role(auth.uid(), 'dealer_admin'::app_role)
          OR (q.created_by = auth.uid() AND q.status = 'draft')
        )
    )
  );

CREATE POLICY "Super admin full access to quotation_items"
  ON public.quotation_items FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Sequence generator
CREATE OR REPLACE FUNCTION public.generate_next_quotation_no(_dealer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next integer;
BEGIN
  INSERT INTO public.invoice_sequences (dealer_id, next_quotation_no)
  VALUES (_dealer_id, 2)
  ON CONFLICT (dealer_id) DO UPDATE
    SET next_quotation_no = invoice_sequences.next_quotation_no + 1
  RETURNING next_quotation_no - 1 INTO _next;
  RETURN 'Q-' || lpad(_next::text, 5, '0');
END;
$$;

-- Lifecycle: mark stale active quotes as expired
CREATE OR REPLACE FUNCTION public.expire_stale_quotations(_dealer_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
BEGIN
  UPDATE public.quotations
  SET status = 'expired'
  WHERE dealer_id = _dealer_id
    AND status = 'active'
    AND valid_until < CURRENT_DATE;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;