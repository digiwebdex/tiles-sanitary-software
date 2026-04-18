-- =========================================================
-- Portal Batch 2: project/site detail + ledger drilldown RPCs
-- All SECURITY DEFINER, scoped via is_portal_user_for_customer()
-- =========================================================

-- 1) Project summary list (lightweight) for the portal
CREATE OR REPLACE FUNCTION public.get_portal_project_summary(_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proj record;
  v_quotations jsonb;
  v_sales jsonb;
  v_deliveries jsonb;
  v_sites jsonb;
  v_items jsonb;
BEGIN
  -- Load project, ensure caller is the portal user for its customer
  SELECT id, customer_id, dealer_id, project_code, project_name, status,
         start_date, expected_end_date, notes
    INTO v_proj
    FROM public.projects
   WHERE id = _project_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF NOT public.is_portal_user_for_customer(v_proj.customer_id) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Sites under this project
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'site_name', s.site_name,
           'address', s.address,
           'status', s.status
         ) ORDER BY s.site_name), '[]'::jsonb)
    INTO v_sites
    FROM public.project_sites s
   WHERE s.project_id = _project_id
     AND s.customer_id = v_proj.customer_id;

  -- Linked quotations
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', q.id,
           'quotation_no', q.quotation_no,
           'revision_no', q.revision_no,
           'quote_date', q.quote_date,
           'status', q.status,
           'total_amount', q.total_amount
         ) ORDER BY q.created_at DESC), '[]'::jsonb)
    INTO v_quotations
    FROM public.quotations q
   WHERE q.project_id = _project_id
     AND q.customer_id = v_proj.customer_id;

  -- Linked sales
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'invoice_number', s.invoice_number,
           'sale_date', s.sale_date,
           'sale_status', s.sale_status,
           'total_amount', s.total_amount,
           'paid_amount', s.paid_amount,
           'due_amount', s.due_amount
         ) ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v_sales
    FROM public.sales s
   WHERE s.project_id = _project_id
     AND s.customer_id = v_proj.customer_id;

  -- Linked deliveries (via sales of this project)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id,
           'delivery_no', d.delivery_no,
           'delivery_date', d.delivery_date,
           'status', d.status,
           'sale_id', d.sale_id,
           'invoice_number', s.invoice_number
         ) ORDER BY d.delivery_date DESC), '[]'::jsonb)
    INTO v_deliveries
    FROM public.deliveries d
    JOIN public.sales s ON s.id = d.sale_id
   WHERE s.project_id = _project_id
     AND s.customer_id = v_proj.customer_id;

  -- Item-level: ordered (sale_items) vs delivered (delivery_items) for this project
  WITH project_sale_items AS (
    SELECT si.id AS sale_item_id,
           si.product_id,
           si.quantity AS ordered_qty,
           p.name AS product_name,
           p.sku AS product_sku,
           p.unit_type AS unit_type
      FROM public.sale_items si
      JOIN public.sales s ON s.id = si.sale_id
      JOIN public.products p ON p.id = si.product_id
     WHERE s.project_id = _project_id
       AND s.customer_id = v_proj.customer_id
  ),
  delivered AS (
    SELECT di.sale_item_id,
           SUM(di.quantity) AS delivered_qty
      FROM public.delivery_items di
     WHERE di.sale_item_id IN (SELECT sale_item_id FROM project_sale_items)
     GROUP BY di.sale_item_id
  ),
  rolled AS (
    SELECT psi.product_id,
           psi.product_name,
           psi.product_sku,
           psi.unit_type,
           SUM(psi.ordered_qty) AS ordered_qty,
           COALESCE(SUM(d.delivered_qty), 0) AS delivered_qty
      FROM project_sale_items psi
      LEFT JOIN delivered d ON d.sale_item_id = psi.sale_item_id
     GROUP BY psi.product_id, psi.product_name, psi.product_sku, psi.unit_type
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_id', product_id,
           'product_name', product_name,
           'product_sku', product_sku,
           'unit_type', unit_type,
           'ordered_qty', ordered_qty,
           'delivered_qty', delivered_qty,
           'pending_qty', GREATEST(ordered_qty - delivered_qty, 0)
         ) ORDER BY product_name), '[]'::jsonb)
    INTO v_items
    FROM rolled;

  RETURN jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_proj.id,
      'project_code', v_proj.project_code,
      'project_name', v_proj.project_name,
      'status', v_proj.status,
      'start_date', v_proj.start_date,
      'expected_end_date', v_proj.expected_end_date,
      'notes', v_proj.notes
    ),
    'sites', v_sites,
    'quotations', v_quotations,
    'sales', v_sales,
    'deliveries', v_deliveries,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_project_summary(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_project_summary(uuid) TO authenticated;


-- 2) Ledger history (recent billed + payments interleaved) — portal-safe
CREATE OR REPLACE FUNCTION public.get_portal_ledger_history(_limit int DEFAULT 30)
RETURNS TABLE(
  entry_date date,
  entry_type text,
  amount numeric,
  description text,
  reference_no text,
  sale_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ctx record;
BEGIN
  SELECT * INTO v_ctx FROM public.get_portal_context();
  IF v_ctx.customer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cl.entry_date,
         cl.type AS entry_type,
         cl.amount,
         cl.description,
         s.invoice_number AS reference_no,
         cl.sale_id
    FROM public.customer_ledger cl
    LEFT JOIN public.sales s ON s.id = cl.sale_id
   WHERE cl.customer_id = v_ctx.customer_id
     AND cl.dealer_id = v_ctx.dealer_id
     -- only safe types: bills, payments, returns
     AND cl.type IN ('sale','payment','return','opening_balance','adjustment')
   ORDER BY cl.entry_date DESC, cl.created_at DESC
   LIMIT GREATEST(_limit, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_ledger_history(int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_ledger_history(int) TO authenticated;
