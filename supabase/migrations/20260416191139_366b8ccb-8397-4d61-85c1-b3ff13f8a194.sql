-- Quotation revise + convert helpers (Batch 2)

-- 1. revise_quotation: marks parent revised, copies header+items into a new active row
CREATE OR REPLACE FUNCTION public.revise_quotation(_quotation_id uuid, _dealer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent record;
  _root_id uuid;
  _root_no text;
  _next_rev integer;
  _new_id uuid;
BEGIN
  -- Lock parent
  SELECT * INTO _parent
  FROM public.quotations
  WHERE id = _quotation_id AND dealer_id = _dealer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF _parent.status NOT IN ('active', 'expired') THEN
    RAISE EXCEPTION 'Only active or expired quotations can be revised (current: %)', _parent.status;
  END IF;

  -- Determine root and shared base quotation_no
  IF _parent.parent_quotation_id IS NULL THEN
    _root_id := _parent.id;
    _root_no := _parent.quotation_no;
  ELSE
    -- Climb to root
    DECLARE
      _cur record := _parent;
    BEGIN
      LOOP
        EXIT WHEN _cur.parent_quotation_id IS NULL;
        SELECT * INTO _cur FROM public.quotations WHERE id = _cur.parent_quotation_id;
        IF NOT FOUND THEN EXIT; END IF;
      END LOOP;
      _root_id := _cur.id;
      _root_no := _cur.quotation_no;
    END;
  END IF;

  -- Compute next revision_no (max across whole chain)
  SELECT COALESCE(MAX(revision_no), 0) + 1 INTO _next_rev
  FROM public.quotations
  WHERE dealer_id = _dealer_id
    AND (id = _root_id OR parent_quotation_id = _root_id);

  -- Mark parent as revised
  UPDATE public.quotations
  SET status = 'revised'
  WHERE id = _quotation_id;

  -- Insert new revision row
  INSERT INTO public.quotations (
    dealer_id, quotation_no, revision_no, parent_quotation_id,
    customer_id, customer_name_text, customer_phone_text, customer_address_text,
    status, quote_date, valid_until,
    subtotal, discount_type, discount_value, total_amount,
    notes, terms_text, created_by
  ) VALUES (
    _dealer_id, _root_no, _next_rev, _root_id,
    _parent.customer_id, _parent.customer_name_text, _parent.customer_phone_text, _parent.customer_address_text,
    'active', CURRENT_DATE, _parent.valid_until,
    _parent.subtotal, _parent.discount_type, _parent.discount_value, _parent.total_amount,
    _parent.notes, _parent.terms_text, auth.uid()
  ) RETURNING id INTO _new_id;

  -- Copy items
  INSERT INTO public.quotation_items (
    dealer_id, quotation_id, product_id,
    product_name_snapshot, product_sku_snapshot,
    unit_type, per_box_sft, quantity, rate,
    discount_value, line_total,
    preferred_shade_code, preferred_caliber, preferred_batch_no,
    notes, sort_order
  )
  SELECT
    dealer_id, _new_id, product_id,
    product_name_snapshot, product_sku_snapshot,
    unit_type, per_box_sft, quantity, rate,
    discount_value, line_total,
    preferred_shade_code, preferred_caliber, preferred_batch_no,
    notes, sort_order
  FROM public.quotation_items
  WHERE quotation_id = _quotation_id;

  -- Audit
  INSERT INTO public.audit_logs (dealer_id, user_id, action, table_name, record_id, new_data)
  VALUES (
    _dealer_id, auth.uid(), 'QUOTATION_REVISED', 'quotations', _new_id,
    jsonb_build_object('parent_id', _quotation_id, 'revision_no', _next_rev, 'quotation_no', _root_no)
  );

  RETURN _new_id;
END;
$$;

-- 2. link_quotation_to_sale: marks the quote converted (called after sale insert)
CREATE OR REPLACE FUNCTION public.link_quotation_to_sale(_quotation_id uuid, _sale_id uuid, _dealer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _q record;
BEGIN
  SELECT * INTO _q
  FROM public.quotations
  WHERE id = _quotation_id AND dealer_id = _dealer_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Quotation not found'; END IF;
  IF _q.status <> 'active' THEN
    RAISE EXCEPTION 'Only active quotations can be linked to a sale (current: %)', _q.status;
  END IF;

  UPDATE public.quotations
  SET status = 'converted',
      converted_sale_id = _sale_id,
      converted_at = now(),
      converted_by = auth.uid()
  WHERE id = _quotation_id;

  INSERT INTO public.audit_logs (dealer_id, user_id, action, table_name, record_id, new_data)
  VALUES (
    _dealer_id, auth.uid(), 'QUOTATION_CONVERTED', 'quotations', _quotation_id,
    jsonb_build_object('sale_id', _sale_id)
  );
END;
$$;