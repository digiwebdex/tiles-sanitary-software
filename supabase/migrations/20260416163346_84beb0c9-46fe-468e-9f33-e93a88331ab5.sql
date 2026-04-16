
-- ============================================================
-- 1. consume_reservation_for_sale: Convert reservation to sale
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_reservation_for_sale(
  _reservation_id uuid,
  _dealer_id uuid,
  _sale_item_id uuid,
  _consume_qty numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _res record;
  _remaining numeric;
  _unit text;
BEGIN
  IF _consume_qty <= 0 THEN
    RAISE EXCEPTION 'Consume quantity must be positive';
  END IF;

  -- Lock reservation
  SELECT * INTO _res
  FROM public.stock_reservations
  WHERE id = _reservation_id AND dealer_id = _dealer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF _res.status <> 'active' THEN
    RAISE EXCEPTION 'Only active reservations can be consumed';
  END IF;

  _remaining := _res.reserved_qty - _res.fulfilled_qty - _res.released_qty;

  IF _consume_qty > _remaining THEN
    RAISE EXCEPTION 'Cannot consume % — only % remaining on reservation', _consume_qty, _remaining;
  END IF;

  -- Update reservation: increase fulfilled_qty
  UPDATE public.stock_reservations SET
    fulfilled_qty = fulfilled_qty + _consume_qty,
    source_type = 'sale',
    source_id = _sale_item_id,
    status = CASE 
      WHEN (fulfilled_qty + _consume_qty + released_qty) >= reserved_qty THEN 'fulfilled'
      ELSE 'active'
    END
  WHERE id = _reservation_id;

  -- Reduce reserved qty on batch and aggregate stock
  -- (The consumed qty is moving from "reserved" to "allocated/sold")
  SELECT unit_type INTO _unit FROM public.products WHERE id = _res.product_id;

  IF _res.batch_id IS NOT NULL THEN
    IF _unit = 'box_sft' THEN
      UPDATE public.product_batches 
      SET reserved_box_qty = GREATEST(0, reserved_box_qty - _consume_qty)
      WHERE id = _res.batch_id;
    ELSE
      UPDATE public.product_batches
      SET reserved_piece_qty = GREATEST(0, reserved_piece_qty - _consume_qty)
      WHERE id = _res.batch_id;
    END IF;
  END IF;

  IF _unit = 'box_sft' THEN
    UPDATE public.stock SET reserved_box_qty = GREATEST(0, reserved_box_qty - _consume_qty)
    WHERE product_id = _res.product_id AND dealer_id = _dealer_id;
  ELSE
    UPDATE public.stock SET reserved_piece_qty = GREATEST(0, reserved_piece_qty - _consume_qty)
    WHERE product_id = _res.product_id AND dealer_id = _dealer_id;
  END IF;
END;
$$;

-- ============================================================
-- 2. Update allocate_sale_batches to respect reserved qty
--    Free qty = batch qty - reserved qty
-- ============================================================
CREATE OR REPLACE FUNCTION public.allocate_sale_batches(
  _dealer_id uuid,
  _sale_item_id uuid,
  _product_id uuid,
  _unit_type text,
  _per_box_sft numeric,
  _allocations jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _alloc jsonb;
  _batch_id uuid;
  _qty numeric;
  _batch record;
  _new_box numeric;
  _new_piece numeric;
  _total_allocated numeric := 0;
BEGIN
  FOR _alloc IN SELECT * FROM jsonb_array_elements(_allocations)
  LOOP
    _batch_id := (_alloc->>'batch_id')::uuid;
    _qty := (_alloc->>'allocated_qty')::numeric;

    -- Lock the batch row to prevent concurrent deduction
    SELECT box_qty, piece_qty, sft_qty, reserved_box_qty, reserved_piece_qty INTO _batch
    FROM public.product_batches
    WHERE id = _batch_id AND dealer_id = _dealer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % not found for dealer %', _batch_id, _dealer_id;
    END IF;

    -- Deduct from batch
    IF _unit_type = 'box_sft' THEN
      _new_box := GREATEST(0, _batch.box_qty - _qty);
      UPDATE public.product_batches SET
        box_qty = _new_box,
        sft_qty = _new_box * COALESCE(_per_box_sft, 0),
        status = CASE WHEN _new_box <= 0 THEN 'depleted' ELSE status END
      WHERE id = _batch_id;
    ELSE
      _new_piece := GREATEST(0, _batch.piece_qty - _qty);
      UPDATE public.product_batches SET
        piece_qty = _new_piece,
        status = CASE WHEN _new_piece <= 0 THEN 'depleted' ELSE status END
      WHERE id = _batch_id;
    END IF;

    -- Create junction record
    INSERT INTO public.sale_item_batches (sale_item_id, batch_id, dealer_id, allocated_qty)
    VALUES (_sale_item_id, _batch_id, _dealer_id, _qty);

    _total_allocated := _total_allocated + _qty;
  END LOOP;

  -- Deduct from aggregate stock (locked row)
  IF _unit_type = 'box_sft' THEN
    UPDATE public.stock SET
      box_qty  = GREATEST(0, box_qty - _total_allocated),
      sft_qty  = GREATEST(0, box_qty - _total_allocated) * COALESCE(_per_box_sft, 0)
    WHERE product_id = _product_id AND dealer_id = _dealer_id;
  ELSE
    UPDATE public.stock SET
      piece_qty = GREATEST(0, piece_qty - _total_allocated)
    WHERE product_id = _product_id AND dealer_id = _dealer_id;
  END IF;

  -- Update allocated_qty on sale_item
  UPDATE public.sale_items SET allocated_qty = _total_allocated
  WHERE id = _sale_item_id;
END;
$$;

-- ============================================================
-- 3. Update expire_stale_reservations to log audit entries
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stale_reservations(_dealer_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _res record;
  _remaining numeric;
  _unit text;
  _count integer := 0;
BEGIN
  FOR _res IN
    SELECT * FROM public.stock_reservations
    WHERE dealer_id = _dealer_id
      AND status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at < now()
    FOR UPDATE
  LOOP
    _remaining := _res.reserved_qty - _res.fulfilled_qty - _res.released_qty;

    UPDATE public.stock_reservations SET
      released_qty = released_qty + _remaining,
      release_reason = 'Auto-expired',
      status = 'expired'
    WHERE id = _res.id;

    SELECT unit_type INTO _unit FROM public.products WHERE id = _res.product_id;

    IF _res.batch_id IS NOT NULL THEN
      IF _unit = 'box_sft' THEN
        UPDATE public.product_batches SET reserved_box_qty = GREATEST(0, reserved_box_qty - _remaining)
        WHERE id = _res.batch_id;
      ELSE
        UPDATE public.product_batches SET reserved_piece_qty = GREATEST(0, reserved_piece_qty - _remaining)
        WHERE id = _res.batch_id;
      END IF;
    END IF;

    IF _unit = 'box_sft' THEN
      UPDATE public.stock SET reserved_box_qty = GREATEST(0, reserved_box_qty - _remaining)
      WHERE product_id = _res.product_id AND dealer_id = _dealer_id;
    ELSE
      UPDATE public.stock SET reserved_piece_qty = GREATEST(0, reserved_piece_qty - _remaining)
      WHERE product_id = _res.product_id AND dealer_id = _dealer_id;
    END IF;

    -- Audit log for auto-expiry
    INSERT INTO public.audit_logs (dealer_id, action, table_name, record_id, new_data)
    VALUES (
      _dealer_id,
      'RESERVATION_AUTO_EXPIRED',
      'stock_reservations',
      _res.id,
      jsonb_build_object(
        'product_id', _res.product_id,
        'customer_id', _res.customer_id,
        'batch_id', _res.batch_id,
        'released_qty', _remaining
      )
    );

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;
