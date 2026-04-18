-- =========================================================
-- PORTAL BATCH 3 — Requests, Document Access, WhatsApp Tie-in
-- =========================================================

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.portal_request_type AS ENUM ('reorder', 'quote');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.portal_request_status AS ENUM ('pending', 'reviewed', 'converted', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.portal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  portal_user_id uuid REFERENCES public.portal_users(id) ON DELETE SET NULL,
  request_type public.portal_request_type NOT NULL,
  status public.portal_request_status NOT NULL DEFAULT 'pending',
  source_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  source_quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.project_sites(id) ON DELETE SET NULL,
  message text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  converted_quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_requests_dealer_status ON public.portal_requests(dealer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_requests_customer ON public.portal_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_requests_portal_user ON public.portal_requests(portal_user_id);

ALTER TABLE public.portal_requests ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
DROP POLICY IF EXISTS "Portal users insert own requests" ON public.portal_requests;
CREATE POLICY "Portal users insert own requests"
ON public.portal_requests
FOR INSERT
TO public
WITH CHECK (is_portal_user_for_customer(customer_id));

DROP POLICY IF EXISTS "Portal users read own requests" ON public.portal_requests;
CREATE POLICY "Portal users read own requests"
ON public.portal_requests
FOR SELECT
TO public
USING (is_portal_user_for_customer(customer_id));

DROP POLICY IF EXISTS "Dealer admins manage portal_requests" ON public.portal_requests;
CREATE POLICY "Dealer admins manage portal_requests"
ON public.portal_requests
FOR ALL
TO authenticated
USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role))
WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role));

DROP POLICY IF EXISTS "Salesmen view portal_requests" ON public.portal_requests;
CREATE POLICY "Salesmen view portal_requests"
ON public.portal_requests
FOR SELECT
TO authenticated
USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Salesmen update portal_requests" ON public.portal_requests;
CREATE POLICY "Salesmen update portal_requests"
ON public.portal_requests
FOR UPDATE
TO authenticated
USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'salesman'::app_role))
WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'salesman'::app_role));

DROP POLICY IF EXISTS "Super admin all portal_requests" ON public.portal_requests;
CREATE POLICY "Super admin all portal_requests"
ON public.portal_requests
FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- updated_at trigger (use existing tg_set_updated_at function)
DROP TRIGGER IF EXISTS trg_portal_requests_updated_at ON public.portal_requests;
CREATE TRIGGER trg_portal_requests_updated_at
BEFORE UPDATE ON public.portal_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- 4. RPCs
-- =========================================================

CREATE OR REPLACE FUNCTION public.submit_portal_request(
  _request_type public.portal_request_type,
  _source_sale_id uuid DEFAULT NULL,
  _source_quotation_id uuid DEFAULT NULL,
  _project_id uuid DEFAULT NULL,
  _site_id uuid DEFAULT NULL,
  _message text DEFAULT NULL,
  _items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_user_id uuid;
  v_customer_id uuid;
  v_dealer_id uuid;
  v_request_id uuid;
BEGIN
  SELECT pu.id, pu.customer_id, pu.dealer_id
  INTO v_portal_user_id, v_customer_id, v_dealer_id
  FROM public.portal_users pu
  WHERE pu.auth_user_id = auth.uid()
    AND pu.status = 'active'
  LIMIT 1;

  IF v_portal_user_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: portal context not found';
  END IF;

  IF _source_sale_id IS NOT NULL THEN
    PERFORM 1 FROM public.sales WHERE id = _source_sale_id AND customer_id = v_customer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'forbidden: sale not in scope'; END IF;
  END IF;

  IF _source_quotation_id IS NOT NULL THEN
    PERFORM 1 FROM public.quotations WHERE id = _source_quotation_id AND customer_id = v_customer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'forbidden: quotation not in scope'; END IF;
  END IF;

  IF _project_id IS NOT NULL THEN
    PERFORM 1 FROM public.projects WHERE id = _project_id AND customer_id = v_customer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'forbidden: project not in scope'; END IF;
  END IF;

  IF _site_id IS NOT NULL THEN
    PERFORM 1 FROM public.project_sites WHERE id = _site_id AND customer_id = v_customer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'forbidden: site not in scope'; END IF;
  END IF;

  INSERT INTO public.portal_requests (
    dealer_id, customer_id, portal_user_id,
    request_type, source_sale_id, source_quotation_id,
    project_id, site_id, message, items
  ) VALUES (
    v_dealer_id, v_customer_id, v_portal_user_id,
    _request_type, _source_sale_id, _source_quotation_id,
    _project_id, _site_id, _message, COALESCE(_items, '[]'::jsonb)
  )
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_portal_request(
  public.portal_request_type, uuid, uuid, uuid, uuid, text, jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_portal_sale_items(_sale_id uuid)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  product_sku text,
  unit_type text,
  quantity numeric,
  rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  SELECT s.customer_id INTO v_customer_id FROM public.sales s WHERE s.id = _sale_id;
  IF v_customer_id IS NULL OR NOT public.is_portal_user_for_customer(v_customer_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    si.product_id,
    COALESCE(p.name, si.product_name_snapshot, 'Item') AS product_name,
    COALESCE(p.sku, si.product_sku_snapshot, '') AS product_sku,
    COALESCE(si.unit_type, 'piece') AS unit_type,
    si.quantity::numeric,
    si.rate::numeric
  FROM public.sale_items si
  LEFT JOIN public.products p ON p.id = si.product_id
  WHERE si.sale_id = _sale_id
  ORDER BY si.created_at ASC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_sale_items(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_portal_quotation_doc(_quotation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quotation jsonb;
  v_items jsonb;
  v_dealer jsonb;
  v_customer jsonb;
  v_customer_id uuid;
BEGIN
  SELECT q.customer_id INTO v_customer_id FROM public.quotations q WHERE q.id = _quotation_id;
  IF v_customer_id IS NULL OR NOT public.is_portal_user_for_customer(v_customer_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT to_jsonb(q.*) INTO v_quotation FROM public.quotations q WHERE q.id = _quotation_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(qi.*) ORDER BY qi.sort_order), '[]'::jsonb) INTO v_items
  FROM public.quotation_items qi WHERE qi.quotation_id = _quotation_id;

  SELECT to_jsonb(d.*) INTO v_dealer
  FROM public.dealers d WHERE d.id = (v_quotation->>'dealer_id')::uuid;

  SELECT to_jsonb(c.*) INTO v_customer
  FROM public.customers c WHERE c.id = v_customer_id;

  RETURN jsonb_build_object(
    'quotation', v_quotation,
    'items', v_items,
    'dealer', v_dealer,
    'customer', v_customer
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_quotation_doc(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_portal_invoice_doc(_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale jsonb;
  v_items jsonb;
  v_dealer jsonb;
  v_customer jsonb;
  v_customer_id uuid;
BEGIN
  SELECT s.customer_id INTO v_customer_id FROM public.sales s WHERE s.id = _sale_id;
  IF v_customer_id IS NULL OR NOT public.is_portal_user_for_customer(v_customer_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT to_jsonb(s.*) INTO v_sale FROM public.sales s WHERE s.id = _sale_id;

  SELECT COALESCE(jsonb_agg(
    to_jsonb(si.*) || jsonb_build_object('product_name', COALESCE(p.name, si.product_name_snapshot))
  ), '[]'::jsonb) INTO v_items
  FROM public.sale_items si
  LEFT JOIN public.products p ON p.id = si.product_id
  WHERE si.sale_id = _sale_id;

  SELECT to_jsonb(d.*) INTO v_dealer
  FROM public.dealers d WHERE d.id = (v_sale->>'dealer_id')::uuid;

  SELECT to_jsonb(c.*) INTO v_customer
  FROM public.customers c WHERE c.id = v_customer_id;

  RETURN jsonb_build_object(
    'sale', v_sale,
    'items', v_items,
    'dealer', v_dealer,
    'customer', v_customer
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoice_doc(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_portal_challan_doc(_challan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challan jsonb;
  v_sale jsonb;
  v_items jsonb;
  v_dealer jsonb;
  v_customer jsonb;
  v_customer_id uuid;
  v_sale_id uuid;
BEGIN
  SELECT c.sale_id INTO v_sale_id FROM public.challans c WHERE c.id = _challan_id;
  IF v_sale_id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT s.customer_id INTO v_customer_id FROM public.sales s WHERE s.id = v_sale_id;
  IF v_customer_id IS NULL OR NOT public.is_portal_user_for_customer(v_customer_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT to_jsonb(c.*) INTO v_challan FROM public.challans c WHERE c.id = _challan_id;
  SELECT to_jsonb(s.*) INTO v_sale FROM public.sales s WHERE s.id = v_sale_id;

  SELECT COALESCE(jsonb_agg(
    to_jsonb(si.*) || jsonb_build_object('product_name', COALESCE(p.name, si.product_name_snapshot))
  ), '[]'::jsonb) INTO v_items
  FROM public.sale_items si
  LEFT JOIN public.products p ON p.id = si.product_id
  WHERE si.sale_id = v_sale_id;

  SELECT to_jsonb(d.*) INTO v_dealer
  FROM public.dealers d WHERE d.id = (v_challan->>'dealer_id')::uuid;

  SELECT to_jsonb(c2.*) INTO v_customer
  FROM public.customers c2 WHERE c2.id = v_customer_id;

  RETURN jsonb_build_object(
    'challan', v_challan,
    'sale', v_sale,
    'items', v_items,
    'dealer', v_dealer,
    'customer', v_customer
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_challan_doc(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_portal_whatsapp_status(
  _source_type text,
  _source_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_log record;
BEGIN
  IF _source_type = 'quotation' THEN
    SELECT customer_id INTO v_customer_id FROM public.quotations WHERE id = _source_id;
  ELSIF _source_type = 'sale' THEN
    SELECT customer_id INTO v_customer_id FROM public.sales WHERE id = _source_id;
  ELSIF _source_type = 'delivery' THEN
    SELECT s.customer_id INTO v_customer_id
    FROM public.deliveries d
    JOIN public.sales s ON s.id = d.sale_id
    WHERE d.id = _source_id;
  ELSE
    RETURN NULL;
  END IF;

  IF v_customer_id IS NULL OR NOT public.is_portal_user_for_customer(v_customer_id) THEN
    RETURN NULL;
  END IF;

  SELECT message_type, status, sent_at, created_at
  INTO v_log
  FROM public.whatsapp_message_logs
  WHERE source_type = _source_type AND source_id = _source_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_log IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'message_type', v_log.message_type,
    'status', v_log.status,
    'sent_at', v_log.sent_at,
    'created_at', v_log.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_whatsapp_status(text, uuid) TO authenticated;