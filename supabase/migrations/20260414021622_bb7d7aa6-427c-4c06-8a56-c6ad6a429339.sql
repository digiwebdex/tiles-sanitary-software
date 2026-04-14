
-- 1. Create login_attempts table for account lockout
CREATE TABLE public.login_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  ip_address text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  is_locked boolean NOT NULL DEFAULT false,
  locked_until timestamptz
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Only super admins can read login attempts
CREATE POLICY "Super admin can view login_attempts"
  ON public.login_attempts FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- Edge functions (service role) bypass RLS, so no insert policy needed for service role
-- But allow authenticated insert for the auth hook
CREATE POLICY "Service can insert login_attempts"
  ON public.login_attempts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_login_attempts_email ON public.login_attempts (email, attempted_at DESC);
CREATE INDEX idx_login_attempts_locked ON public.login_attempts (email, is_locked, locked_until);

-- 2. Function to check if account is locked
CREATE OR REPLACE FUNCTION public.check_account_locked(_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lock_record record;
  _failed_count integer;
  _lockout_minutes integer := 30;
  _max_attempts integer := 3;
  _window_minutes integer := 15;
BEGIN
  -- Check for active lock
  SELECT * INTO _lock_record
  FROM public.login_attempts
  WHERE email = lower(_email)
    AND is_locked = true
    AND locked_until > now()
  ORDER BY locked_until DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'locked', true,
      'locked_until', _lock_record.locked_until,
      'remaining_minutes', EXTRACT(EPOCH FROM (_lock_record.locked_until - now())) / 60
    );
  END IF;

  -- Count recent failed attempts
  SELECT count(*) INTO _failed_count
  FROM public.login_attempts
  WHERE email = lower(_email)
    AND is_locked = false
    AND attempted_at > now() - (_window_minutes || ' minutes')::interval;

  RETURN jsonb_build_object(
    'locked', false,
    'attempts', _failed_count,
    'remaining_attempts', GREATEST(0, _max_attempts - _failed_count)
  );
END;
$$;

-- 3. Function to record failed login
CREATE OR REPLACE FUNCTION public.record_failed_login(_email text, _ip text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _failed_count integer;
  _max_attempts integer := 3;
  _window_minutes integer := 15;
  _lockout_minutes integer := 30;
  _lock_until timestamptz;
BEGIN
  -- Insert the failed attempt
  INSERT INTO public.login_attempts (email, ip_address, is_locked)
  VALUES (lower(_email), _ip, false);

  -- Count recent failures
  SELECT count(*) INTO _failed_count
  FROM public.login_attempts
  WHERE email = lower(_email)
    AND is_locked = false
    AND attempted_at > now() - (_window_minutes || ' minutes')::interval;

  -- If max attempts reached, lock the account
  IF _failed_count >= _max_attempts THEN
    _lock_until := now() + (_lockout_minutes || ' minutes')::interval;

    INSERT INTO public.login_attempts (email, ip_address, is_locked, locked_until)
    VALUES (lower(_email), _ip, true, _lock_until);

    -- Log the lockout in audit
    INSERT INTO public.audit_logs (action, table_name, new_data)
    VALUES (
      'ACCOUNT_LOCKED',
      'login_attempts',
      jsonb_build_object(
        'email', lower(_email),
        'ip', _ip,
        'failed_count', _failed_count,
        'locked_until', _lock_until
      )
    );

    RETURN jsonb_build_object(
      'locked', true,
      'locked_until', _lock_until,
      'message', 'Account locked due to too many failed attempts. Try again after 30 minutes.'
    );
  END IF;

  RETURN jsonb_build_object(
    'locked', false,
    'attempts', _failed_count,
    'remaining_attempts', _max_attempts - _failed_count
  );
END;
$$;

-- 4. Function to clear failed attempts on successful login
CREATE OR REPLACE FUNCTION public.record_successful_login(_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clear all non-locked recent attempts for this email
  DELETE FROM public.login_attempts
  WHERE email = lower(_email)
    AND is_locked = false;

  -- Clear expired locks
  DELETE FROM public.login_attempts
  WHERE email = lower(_email)
    AND is_locked = true
    AND locked_until < now();
END;
$$;

-- 5. Fix audit_logs: Remove overly permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Replace with dealer-scoped insert
CREATE POLICY "Dealer users can insert own audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    dealer_id IS NULL 
    OR dealer_id = get_user_dealer_id(auth.uid())
  );

-- 6. Fix user_roles: Add RESTRICTIVE policy to prevent privilege escalation
CREATE POLICY "Only super admins can modify roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 7. Harden campaign_gifts: Change public to authenticated
DROP POLICY IF EXISTS "Dealer admins can manage campaign_gifts" ON public.campaign_gifts;
CREATE POLICY "Dealer admins can manage campaign_gifts"
  ON public.campaign_gifts FOR ALL
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

DROP POLICY IF EXISTS "Dealer users can view campaign_gifts" ON public.campaign_gifts;
CREATE POLICY "Dealer users can view campaign_gifts"
  ON public.campaign_gifts FOR SELECT
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Subscription required for campaign_gifts writes" ON public.campaign_gifts;
CREATE POLICY "Subscription required for campaign_gifts writes"
  ON public.campaign_gifts FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Super admin full access to campaign_gifts" ON public.campaign_gifts;
CREATE POLICY "Super admin full access to campaign_gifts"
  ON public.campaign_gifts FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 8. Harden credit_overrides
DROP POLICY IF EXISTS "Dealer admins can manage credit_overrides" ON public.credit_overrides;
CREATE POLICY "Dealer admins can manage credit_overrides"
  ON public.credit_overrides FOR ALL
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

DROP POLICY IF EXISTS "Dealer users can view credit_overrides" ON public.credit_overrides;
CREATE POLICY "Dealer users can view credit_overrides"
  ON public.credit_overrides FOR SELECT
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Super admin full access to credit_overrides" ON public.credit_overrides;
CREATE POLICY "Super admin full access to credit_overrides"
  ON public.credit_overrides FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 9. Harden notification_settings
DROP POLICY IF EXISTS "Dealer admins can manage notification_settings" ON public.notification_settings;
CREATE POLICY "Dealer admins can manage notification_settings"
  ON public.notification_settings FOR ALL
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

DROP POLICY IF EXISTS "Dealer users can view notification_settings" ON public.notification_settings;
CREATE POLICY "Dealer users can view notification_settings"
  ON public.notification_settings FOR SELECT
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Super admin full access to notification_settings" ON public.notification_settings;
CREATE POLICY "Super admin full access to notification_settings"
  ON public.notification_settings FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 10. Harden deliveries
DROP POLICY IF EXISTS "Dealer admins can manage deliveries" ON public.deliveries;
CREATE POLICY "Dealer admins can manage deliveries"
  ON public.deliveries FOR ALL
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

DROP POLICY IF EXISTS "Dealer users can view deliveries" ON public.deliveries;
CREATE POLICY "Dealer users can view deliveries"
  ON public.deliveries FOR SELECT
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Salesmen can create deliveries" ON public.deliveries;
CREATE POLICY "Salesmen can create deliveries"
  ON public.deliveries FOR INSERT
  TO authenticated
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

DROP POLICY IF EXISTS "Subscription required for delivery writes" ON public.deliveries;
CREATE POLICY "Subscription required for delivery writes"
  ON public.deliveries FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Super admin full access to deliveries" ON public.deliveries;
CREATE POLICY "Super admin full access to deliveries"
  ON public.deliveries FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 11. Harden delivery_items
DROP POLICY IF EXISTS "Dealer admins can manage delivery_items" ON public.delivery_items;
CREATE POLICY "Dealer admins can manage delivery_items"
  ON public.delivery_items FOR ALL
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

DROP POLICY IF EXISTS "Dealer users can view delivery_items" ON public.delivery_items;
CREATE POLICY "Dealer users can view delivery_items"
  ON public.delivery_items FOR SELECT
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Salesmen can create delivery_items" ON public.delivery_items;
CREATE POLICY "Salesmen can create delivery_items"
  ON public.delivery_items FOR INSERT
  TO authenticated
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

DROP POLICY IF EXISTS "Subscription required for delivery_items writes" ON public.delivery_items;
CREATE POLICY "Subscription required for delivery_items writes"
  ON public.delivery_items FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Super admin full access to delivery_items" ON public.delivery_items;
CREATE POLICY "Super admin full access to delivery_items"
  ON public.delivery_items FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 12. Harden purchase_returns
DROP POLICY IF EXISTS "Dealer admins can manage purchase_returns" ON public.purchase_returns;
CREATE POLICY "Dealer admins can manage purchase_returns"
  ON public.purchase_returns FOR ALL
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

DROP POLICY IF EXISTS "Dealer users can view purchase_returns" ON public.purchase_returns;
CREATE POLICY "Dealer users can view purchase_returns"
  ON public.purchase_returns FOR SELECT
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Salesmen can create purchase_returns" ON public.purchase_returns;
CREATE POLICY "Salesmen can create purchase_returns"
  ON public.purchase_returns FOR INSERT
  TO authenticated
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

DROP POLICY IF EXISTS "Subscription required for purchase_returns writes" ON public.purchase_returns;
CREATE POLICY "Subscription required for purchase_returns writes"
  ON public.purchase_returns FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Super admin full access to purchase_returns" ON public.purchase_returns;
CREATE POLICY "Super admin full access to purchase_returns"
  ON public.purchase_returns FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 13. Harden purchase_return_items
DROP POLICY IF EXISTS "Dealer admins can manage purchase_return_items" ON public.purchase_return_items;
CREATE POLICY "Dealer admins can manage purchase_return_items"
  ON public.purchase_return_items FOR ALL
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

DROP POLICY IF EXISTS "Dealer users can view purchase_return_items" ON public.purchase_return_items;
CREATE POLICY "Dealer users can view purchase_return_items"
  ON public.purchase_return_items FOR SELECT
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Salesmen can create purchase_return_items" ON public.purchase_return_items;
CREATE POLICY "Salesmen can create purchase_return_items"
  ON public.purchase_return_items FOR INSERT
  TO authenticated
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

DROP POLICY IF EXISTS "Subscription required for purchase_return_items writes" ON public.purchase_return_items;
CREATE POLICY "Subscription required for purchase_return_items writes"
  ON public.purchase_return_items FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Super admin full access to purchase_return_items" ON public.purchase_return_items;
CREATE POLICY "Super admin full access to purchase_return_items"
  ON public.purchase_return_items FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 14. Harden challans
DROP POLICY IF EXISTS "Dealer admins can manage challans" ON public.challans;
CREATE POLICY "Dealer admins can manage challans"
  ON public.challans FOR ALL
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

DROP POLICY IF EXISTS "Dealer users can view challans" ON public.challans;
CREATE POLICY "Dealer users can view challans"
  ON public.challans FOR SELECT
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Salesmen can create challans" ON public.challans;
CREATE POLICY "Salesmen can create challans"
  ON public.challans FOR INSERT
  TO authenticated
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

DROP POLICY IF EXISTS "Subscription required for challan writes" ON public.challans;
CREATE POLICY "Subscription required for challan writes"
  ON public.challans FOR INSERT
  TO authenticated
  WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Super admin full access to challans" ON public.challans;
CREATE POLICY "Super admin full access to challans"
  ON public.challans FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 15. Harden notifications
DROP POLICY IF EXISTS "Dealer admins can manage notifications" ON public.notifications;
CREATE POLICY "Dealer admins can manage notifications"
  ON public.notifications FOR ALL
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

DROP POLICY IF EXISTS "Dealer users can view notifications" ON public.notifications;
CREATE POLICY "Dealer users can view notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Super admin full access to notifications" ON public.notifications;
CREATE POLICY "Super admin full access to notifications"
  ON public.notifications FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 16. Harden contact_submissions (keep public INSERT for contact form)
DROP POLICY IF EXISTS "Super admin can read all submissions" ON public.contact_submissions;
CREATE POLICY "Super admin can read all submissions"
  ON public.contact_submissions FOR SELECT
  TO authenticated
  USING (is_super_admin());

DROP POLICY IF EXISTS "Super admin can update submissions" ON public.contact_submissions;
CREATE POLICY "Super admin can update submissions"
  ON public.contact_submissions FOR UPDATE
  TO authenticated
  USING (is_super_admin());

-- 17. Harden audit_logs super admin policy
DROP POLICY IF EXISTS "Super admin full access" ON public.audit_logs;
CREATE POLICY "Super admin full access"
  ON public.audit_logs FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
