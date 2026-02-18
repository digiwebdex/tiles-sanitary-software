
-- 1. Add CHECK constraints preventing negative stock values
ALTER TABLE public.stock
  ADD CONSTRAINT stock_box_qty_non_negative CHECK (box_qty >= 0),
  ADD CONSTRAINT stock_piece_qty_non_negative CHECK (piece_qty >= 0),
  ADD CONSTRAINT stock_sft_qty_non_negative CHECK (sft_qty >= 0);

-- 2. Remove direct INSERT/UPDATE/DELETE access for non-service operations.
-- Only allow writes through the app (authenticated) but log every change via trigger.
-- Revoke direct access from anon role entirely.
REVOKE INSERT, UPDATE, DELETE ON public.stock FROM anon;

-- 3. Create a trigger that logs ALL stock changes to audit_logs automatically.
CREATE OR REPLACE FUNCTION public.log_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    dealer_id,
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    COALESCE(NEW.dealer_id, OLD.dealer_id),
    auth.uid()::text,
    TG_OP,
    'stock',
    COALESCE(NEW.id, OLD.id)::text,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_stock_change ON public.stock;
CREATE TRIGGER trg_log_stock_change
  AFTER INSERT OR UPDATE OR DELETE ON public.stock
  FOR EACH ROW
  EXECUTE FUNCTION public.log_stock_change();

-- 4. Add RLS policy restricting stock writes to only users with active subscriptions
-- (reads are still allowed for readonly users)
DROP POLICY IF EXISTS "Subscription required for stock writes" ON public.stock;
CREATE POLICY "Subscription required for stock writes"
  ON public.stock
  FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Subscription required for stock updates" ON public.stock;
CREATE POLICY "Subscription required for stock updates"
  ON public.stock
  FOR UPDATE
  TO authenticated
  USING (has_active_subscription());

DROP POLICY IF EXISTS "Block stock deletes" ON public.stock;
CREATE POLICY "Block stock deletes"
  ON public.stock
  FOR DELETE
  TO authenticated
  USING (false);
