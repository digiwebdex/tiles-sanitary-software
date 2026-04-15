
-- Atomic function to populate delivery_item_batches from sale_item_batches
-- Logic: for each delivery_item, look up sale_item_batches for that sale_item,
-- compute already-delivered per batch from existing delivery_item_batches,
-- then distribute the delivery qty across batches in FIFO order (oldest allocation first).
CREATE OR REPLACE FUNCTION public.execute_delivery_batches(
  _delivery_id uuid,
  _dealer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _di record;        -- delivery_item
  _sib record;       -- sale_item_batch allocation
  _remaining numeric;
  _already_delivered numeric;
  _can_deliver numeric;
  _deliver_now numeric;
BEGIN
  -- Loop through each delivery_item for this delivery
  FOR _di IN
    SELECT id, sale_item_id, product_id, quantity
    FROM public.delivery_items
    WHERE delivery_id = _delivery_id AND dealer_id = _dealer_id
  LOOP
    _remaining := _di.quantity;

    -- Get sale_item_batches for this sale_item, ordered by creation (FIFO)
    FOR _sib IN
      SELECT sib.batch_id, sib.allocated_qty, pb.created_at
      FROM public.sale_item_batches sib
      JOIN public.product_batches pb ON pb.id = sib.batch_id
      WHERE sib.sale_item_id = _di.sale_item_id
        AND sib.dealer_id = _dealer_id
      ORDER BY pb.created_at ASC
    LOOP
      IF _remaining <= 0 THEN EXIT; END IF;

      -- Calculate how much of this batch allocation has already been delivered
      SELECT COALESCE(SUM(dib.delivered_qty), 0) INTO _already_delivered
      FROM public.delivery_item_batches dib
      JOIN public.delivery_items di2 ON di2.id = dib.delivery_item_id
      WHERE di2.sale_item_id = _di.sale_item_id
        AND dib.batch_id = _sib.batch_id
        AND dib.dealer_id = _dealer_id;

      _can_deliver := GREATEST(0, _sib.allocated_qty - _already_delivered);
      
      IF _can_deliver <= 0 THEN CONTINUE; END IF;

      _deliver_now := LEAST(_remaining, _can_deliver);

      INSERT INTO public.delivery_item_batches (delivery_item_id, batch_id, dealer_id, delivered_qty)
      VALUES (_di.id, _sib.batch_id, _dealer_id, _deliver_now);

      _remaining := _remaining - _deliver_now;
    END LOOP;

    -- If there's still remaining qty (unbatched/legacy stock), skip batch tracking for that portion
    -- This ensures backward compatibility with legacy stock
  END LOOP;
END;
$$;
