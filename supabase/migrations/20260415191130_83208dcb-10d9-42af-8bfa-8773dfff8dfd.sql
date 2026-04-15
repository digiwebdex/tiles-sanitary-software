
-- 1. Create stock_reservations table
CREATE TABLE public.stock_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.product_batches(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reserved_qty numeric NOT NULL DEFAULT 0,
  fulfilled_qty numeric NOT NULL DEFAULT 0,
  released_qty numeric NOT NULL DEFAULT 0,
  reason text,
  release_reason text,
  source_type text NOT NULL DEFAULT 'manual',
  source_id uuid,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  -- Safety constraints
  CONSTRAINT chk_reserved_qty_gte_zero CHECK (reserved_qty >= 0),
  CONSTRAINT chk_fulfilled_qty_gte_zero CHECK (fulfilled_qty >= 0),
  CONSTRAINT chk_released_qty_gte_zero CHECK (released_qty >= 0),
  CONSTRAINT chk_remaining_qty_gte_zero CHECK ((reserved_qty - fulfilled_qty - released_qty) >= 0),
  CONSTRAINT chk_consumed_lte_reserved CHECK ((fulfilled_qty + released_qty) <= reserved_qty)
);

-- Index for lookups
CREATE INDEX idx_stock_reservations_dealer ON public.stock_reservations(dealer_id);
CREATE INDEX idx_stock_reservations_product ON public.stock_reservations(product_id);
CREATE INDEX idx_stock_reservations_customer ON public.stock_reservations(customer_id);
CREATE INDEX idx_stock_reservations_batch ON public.stock_reservations(batch_id);
CREATE INDEX idx_stock_reservations_status ON public.stock_reservations(status);
CREATE INDEX idx_stock_reservations_expires ON public.stock_reservations(expires_at) WHERE status = 'active';

-- Updated_at trigger
CREATE TRIGGER update_stock_reservations_updated_at
  BEFORE UPDATE ON public.stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer admins can manage stock_reservations"
  ON public.stock_reservations FOR ALL
  TO authenticated
  USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role))
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Dealer users can view stock_reservations"
  ON public.stock_reservations FOR SELECT
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Salesmen can create stock_reservations"
  ON public.stock_reservations FOR INSERT
  TO authenticated
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'salesman'::app_role));

CREATE POLICY "Subscription required for stock_reservations writes"
  ON public.stock_reservations FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to stock_reservations"
  ON public.stock_reservations FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 2. Add reserved columns to product_batches
ALTER TABLE public.product_batches
  ADD COLUMN IF NOT EXISTS reserved_box_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_piece_qty numeric NOT NULL DEFAULT 0;

ALTER TABLE public.product_batches
  ADD CONSTRAINT chk_pb_reserved_box_gte_zero CHECK (reserved_box_qty >= 0),
  ADD CONSTRAINT chk_pb_reserved_piece_gte_zero CHECK (reserved_piece_qty >= 0),
  ADD CONSTRAINT chk_pb_reserved_box_lte_total CHECK (reserved_box_qty <= box_qty),
  ADD CONSTRAINT chk_pb_reserved_piece_lte_total CHECK (reserved_piece_qty <= piece_qty);

-- 3. Add CHECK constraints to stock table for reserved columns (columns already exist)
ALTER TABLE public.stock
  ADD CONSTRAINT chk_stock_reserved_box_gte_zero CHECK (reserved_box_qty >= 0),
  ADD CONSTRAINT chk_stock_reserved_piece_gte_zero CHECK (reserved_piece_qty >= 0);

-- 4. Add enable_reservations flag to dealers
ALTER TABLE public.dealers
  ADD COLUMN IF NOT EXISTS enable_reservations boolean NOT NULL DEFAULT false;

-- 5. Create atomic RPC to reserve stock (updates batch + aggregate in one transaction)
CREATE OR REPLACE FUNCTION public.create_stock_reservation(
  _dealer_id uuid,
  _product_id uuid,
  _batch_id uuid,
  _customer_id uuid,
  _qty numeric,
  _unit_type text,
  _reason text DEFAULT NULL,
  _expires_at timestamptz DEFAULT NULL,
  _created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _reservation_id uuid;
  _batch record;
  _stock record;
BEGIN
  -- Validate qty
  IF _qty <= 0 THEN
    RAISE EXCEPTION 'Reserved quantity must be positive';
  END IF;

  -- If batch-specific reservation
  IF _batch_id IS NOT NULL THEN
    SELECT box_qty, piece_qty, reserved_box_qty, reserved_piece_qty
    INTO _batch
    FROM public.product_batches
    WHERE id = _batch_id AND dealer_id = _dealer_id AND product_id = _product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch not found for this product and dealer';
    END IF;

    -- Check free qty in batch
    IF _unit_type = 'box_sft' THEN
      IF (_batch.box_qty - _batch.reserved_box_qty) < _qty THEN
        RAISE EXCEPTION 'Insufficient free batch stock. Available: %, Requested: %',
          (_batch.box_qty - _batch.reserved_box_qty), _qty;
      END IF;
      UPDATE public.product_batches
        SET reserved_box_qty = reserved_box_qty + _qty
        WHERE id = _batch_id;
    ELSE
      IF (_batch.piece_qty - _batch.reserved_piece_qty) < _qty THEN
        RAISE EXCEPTION 'Insufficient free batch stock. Available: %, Requested: %',
          (_batch.piece_qty - _batch.reserved_piece_qty), _qty;
      END IF;
      UPDATE public.product_batches
        SET reserved_piece_qty = reserved_piece_qty + _qty
        WHERE id = _batch_id;
    END IF;
  END IF;

  -- Update aggregate stock reserved qty
  SELECT reserved_box_qty, reserved_piece_qty INTO _stock
  FROM public.stock
  WHERE product_id = _product_id AND dealer_id = _dealer_id
  FOR UPDATE;

  IF FOUND THEN
    IF _unit_type = 'box_sft' THEN
      UPDATE public.stock SET reserved_box_qty = reserved_box_qty + _qty
      WHERE product_id = _product_id AND dealer_id = _dealer_id;
    ELSE
      UPDATE public.stock SET reserved_piece_qty = reserved_piece_qty + _qty
      WHERE product_id = _product_id AND dealer_id = _dealer_id;
    END IF;
  END IF;

  -- Insert reservation record
  INSERT INTO public.stock_reservations (
    dealer_id, product_id, batch_id, customer_id,
    reserved_qty, reason, expires_at, created_by
  ) VALUES (
    _dealer_id, _product_id, _batch_id, _customer_id,
    _qty, _reason, _expires_at, _created_by
  ) RETURNING id INTO _reservation_id;

  RETURN _reservation_id;
END;
$$;

-- 6. Atomic RPC to release a reservation
CREATE OR REPLACE FUNCTION public.release_stock_reservation(
  _reservation_id uuid,
  _dealer_id uuid,
  _release_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _res record;
  _remaining numeric;
BEGIN
  -- Lock reservation
  SELECT * INTO _res
  FROM public.stock_reservations
  WHERE id = _reservation_id AND dealer_id = _dealer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF _res.status <> 'active' THEN
    RAISE EXCEPTION 'Only active reservations can be released';
  END IF;

  _remaining := _res.reserved_qty - _res.fulfilled_qty - _res.released_qty;

  IF _remaining <= 0 THEN
    RAISE EXCEPTION 'No remaining quantity to release';
  END IF;

  -- Release the remaining qty
  UPDATE public.stock_reservations SET
    released_qty = released_qty + _remaining,
    release_reason = _release_reason,
    status = 'released'
  WHERE id = _reservation_id;

  -- Restore batch reserved qty
  IF _res.batch_id IS NOT NULL THEN
    -- Determine unit type from product
    DECLARE _unit text;
    BEGIN
      SELECT unit_type INTO _unit FROM public.products WHERE id = _res.product_id;
      IF _unit = 'box_sft' THEN
        UPDATE public.product_batches SET reserved_box_qty = GREATEST(0, reserved_box_qty - _remaining)
        WHERE id = _res.batch_id;
      ELSE
        UPDATE public.product_batches SET reserved_piece_qty = GREATEST(0, reserved_piece_qty - _remaining)
        WHERE id = _res.batch_id;
      END IF;
    END;
  END IF;

  -- Restore aggregate stock reserved qty
  DECLARE _unit2 text;
  BEGIN
    SELECT unit_type INTO _unit2 FROM public.products WHERE id = _res.product_id;
    IF _unit2 = 'box_sft' THEN
      UPDATE public.stock SET reserved_box_qty = GREATEST(0, reserved_box_qty - _remaining)
      WHERE product_id = _res.product_id AND dealer_id = _dealer_id;
    ELSE
      UPDATE public.stock SET reserved_piece_qty = GREATEST(0, reserved_piece_qty - _remaining)
      WHERE product_id = _res.product_id AND dealer_id = _dealer_id;
    END IF;
  END;
END;
$$;

-- 7. Atomic RPC to expire stale reservations
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

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;
