
-- Database function that checks if the current user's dealer has an active or grace-period subscription.
-- Returns TRUE if the user is super_admin, or if subscription is active, or expired within 3-day grace.
-- Returns FALSE otherwise, blocking write operations at the RLS level.
CREATE OR REPLACE FUNCTION public.has_active_subscription()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dealer_id uuid;
  _sub record;
  _is_super boolean;
BEGIN
  -- Super admins bypass subscription checks
  SELECT is_super_admin() INTO _is_super;
  IF _is_super THEN RETURN TRUE; END IF;

  -- Get dealer_id for the current user
  SELECT dealer_id INTO _dealer_id FROM profiles WHERE id = auth.uid();
  IF _dealer_id IS NULL THEN RETURN FALSE; END IF;

  -- Get latest subscription
  SELECT status, end_date INTO _sub
  FROM subscriptions
  WHERE dealer_id = _dealer_id
  ORDER BY start_date DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF _sub.status = 'active' THEN RETURN TRUE; END IF;
  IF _sub.status = 'suspended' THEN RETURN FALSE; END IF;

  -- Expired: allow 3-day grace period
  IF _sub.status = 'expired' AND _sub.end_date IS NOT NULL THEN
    IF now() <= (_sub.end_date::timestamptz + interval '3 days') THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- Now add subscription enforcement to write policies on key business tables.
-- We add WITH CHECK using has_active_subscription() on INSERT/UPDATE/DELETE.

-- Products: add subscription check to existing INSERT/UPDATE policies
DROP POLICY IF EXISTS "Subscription required for product writes" ON public.products;
CREATE POLICY "Subscription required for product writes"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Subscription required for product updates" ON public.products;
CREATE POLICY "Subscription required for product updates"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (has_active_subscription());

-- Sales
DROP POLICY IF EXISTS "Subscription required for sale writes" ON public.sales;
CREATE POLICY "Subscription required for sale writes"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Subscription required for sale updates" ON public.sales;
CREATE POLICY "Subscription required for sale updates"
  ON public.sales
  FOR UPDATE
  TO authenticated
  USING (has_active_subscription());

-- Purchases
DROP POLICY IF EXISTS "Subscription required for purchase writes" ON public.purchases;
CREATE POLICY "Subscription required for purchase writes"
  ON public.purchases
  FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Subscription required for purchase updates" ON public.purchases;
CREATE POLICY "Subscription required for purchase updates"
  ON public.purchases
  FOR UPDATE
  TO authenticated
  USING (has_active_subscription());

-- Sale items
DROP POLICY IF EXISTS "Subscription required for sale_items writes" ON public.sale_items;
CREATE POLICY "Subscription required for sale_items writes"
  ON public.sale_items
  FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

-- Purchase items
DROP POLICY IF EXISTS "Subscription required for purchase_items writes" ON public.purchase_items;
CREATE POLICY "Subscription required for purchase_items writes"
  ON public.purchase_items
  FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

-- Sales returns
DROP POLICY IF EXISTS "Subscription required for sales_returns writes" ON public.sales_returns;
CREATE POLICY "Subscription required for sales_returns writes"
  ON public.sales_returns
  FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

-- Expenses
DROP POLICY IF EXISTS "Subscription required for expense writes" ON public.expenses;
CREATE POLICY "Subscription required for expense writes"
  ON public.expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());
