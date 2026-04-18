-- 1. Portal role enum
CREATE TYPE public.portal_role AS ENUM ('contractor', 'architect', 'project_customer');

-- 2. Portal users table
CREATE TABLE public.portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  auth_user_id UUID UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  portal_role public.portal_role NOT NULL DEFAULT 'contractor',
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','inactive','revoked')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dealer_id, email)
);

CREATE INDEX idx_portal_users_dealer ON public.portal_users(dealer_id);
CREATE INDEX idx_portal_users_customer ON public.portal_users(customer_id);
CREATE INDEX idx_portal_users_auth ON public.portal_users(auth_user_id);

CREATE TRIGGER portal_users_touch_updated_at
BEFORE UPDATE ON public.portal_users
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.portal_users ENABLE ROW LEVEL SECURITY;

-- 3. RLS for portal_users
CREATE POLICY "Super admins manage all portal users"
ON public.portal_users FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Dealer admins manage own dealer's portal users"
ON public.portal_users FOR ALL
USING (
  public.has_role(auth.uid(), 'dealer_admin'::public.app_role)
  AND public.get_user_dealer_id(auth.uid()) = dealer_id
)
WITH CHECK (
  public.has_role(auth.uid(), 'dealer_admin'::public.app_role)
  AND public.get_user_dealer_id(auth.uid()) = dealer_id
);

CREATE POLICY "Portal users can view own row"
ON public.portal_users FOR SELECT
USING (auth_user_id = auth.uid());

-- 4. Helper: get portal context for current user (returns null if not a portal user)
CREATE OR REPLACE FUNCTION public.get_portal_context()
RETURNS TABLE(dealer_id UUID, customer_id UUID, portal_user_id UUID)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pu.dealer_id, pu.customer_id, pu.id
  FROM public.portal_users pu
  WHERE pu.auth_user_id = auth.uid()
    AND pu.status = 'active'
  LIMIT 1;
$$;

-- 5. Helper: check if current user is a portal user scoped to a given customer
CREATE OR REPLACE FUNCTION public.is_portal_user_for_customer(_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_users
    WHERE auth_user_id = auth.uid()
      AND status = 'active'
      AND customer_id = _customer_id
  );
$$;

-- 6. Add portal-read policies to existing tables (additive — don't touch existing policies)
CREATE POLICY "Portal users read own quotations"
ON public.quotations FOR SELECT
USING (customer_id IS NOT NULL AND public.is_portal_user_for_customer(customer_id));

CREATE POLICY "Portal users read own quotation items"
ON public.quotation_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.quotations q
  WHERE q.id = quotation_items.quotation_id
    AND q.customer_id IS NOT NULL
    AND public.is_portal_user_for_customer(q.customer_id)
));

CREATE POLICY "Portal users read own sales"
ON public.sales FOR SELECT
USING (public.is_portal_user_for_customer(customer_id));

CREATE POLICY "Portal users read own sale items"
ON public.sale_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.sales s
  WHERE s.id = sale_items.sale_id
    AND public.is_portal_user_for_customer(s.customer_id)
));

CREATE POLICY "Portal users read own challans"
ON public.challans FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.sales s
  WHERE s.id = challans.sale_id
    AND public.is_portal_user_for_customer(s.customer_id)
));

CREATE POLICY "Portal users read own deliveries"
ON public.deliveries FOR SELECT
USING (
  sale_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = deliveries.sale_id
      AND public.is_portal_user_for_customer(s.customer_id)
  )
);

CREATE POLICY "Portal users read own delivery items"
ON public.delivery_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.deliveries d
  JOIN public.sales s ON s.id = d.sale_id
  WHERE d.id = delivery_items.delivery_id
    AND public.is_portal_user_for_customer(s.customer_id)
));

CREATE POLICY "Portal users read own projects"
ON public.projects FOR SELECT
USING (public.is_portal_user_for_customer(customer_id));

CREATE POLICY "Portal users read own project sites"
ON public.project_sites FOR SELECT
USING (public.is_portal_user_for_customer(customer_id));

CREATE POLICY "Portal users read own customer profile"
ON public.customers FOR SELECT
USING (public.is_portal_user_for_customer(id));

-- 7. Outstanding summary RPC (no raw ledger access)
CREATE OR REPLACE FUNCTION public.get_portal_outstanding_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ctx RECORD;
  _outstanding NUMERIC := 0;
  _total_billed NUMERIC := 0;
  _total_paid NUMERIC := 0;
  _last_payment_date DATE;
  _last_payment_amount NUMERIC;
BEGIN
  SELECT * INTO _ctx FROM public.get_portal_context();
  IF _ctx.customer_id IS NULL THEN
    RETURN jsonb_build_object('error','no_portal_context');
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN type IN ('sale','adjustment') THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END), 0)
  INTO _total_billed, _total_paid
  FROM public.customer_ledger
  WHERE dealer_id = _ctx.dealer_id AND customer_id = _ctx.customer_id;

  _outstanding := _total_billed - _total_paid;

  SELECT entry_date, amount INTO _last_payment_date, _last_payment_amount
  FROM public.customer_ledger
  WHERE dealer_id = _ctx.dealer_id
    AND customer_id = _ctx.customer_id
    AND type = 'payment'
  ORDER BY entry_date DESC, created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'outstanding', _outstanding,
    'total_billed', _total_billed,
    'total_paid', _total_paid,
    'last_payment_date', _last_payment_date,
    'last_payment_amount', _last_payment_amount
  );
END;
$$;

-- 8. Recent payments RPC (payment-only summary, capped)
CREATE OR REPLACE FUNCTION public.get_portal_recent_payments(_limit INTEGER DEFAULT 10)
RETURNS TABLE(entry_date DATE, amount NUMERIC, description TEXT, sale_id UUID)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ctx RECORD;
BEGIN
  SELECT * INTO _ctx FROM public.get_portal_context();
  IF _ctx.customer_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT cl.entry_date, cl.amount, cl.description, cl.sale_id
  FROM public.customer_ledger cl
  WHERE cl.dealer_id = _ctx.dealer_id
    AND cl.customer_id = _ctx.customer_id
    AND cl.type = 'payment'
  ORDER BY cl.entry_date DESC, cl.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
END;
$$;

-- 9. Touch last_login_at helper (called from app on portal login)
CREATE OR REPLACE FUNCTION public.portal_touch_last_login()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.portal_users
  SET last_login_at = now(),
      activated_at = COALESCE(activated_at, now()),
      status = CASE WHEN status = 'invited' THEN 'active' ELSE status END
  WHERE auth_user_id = auth.uid();
$$;

-- 10. Bind a freshly-authed auth user to their invited portal_users row by email
CREATE OR REPLACE FUNCTION public.portal_bind_auth_user()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email TEXT;
BEGIN
  SELECT lower(email) INTO _email FROM auth.users WHERE id = auth.uid();
  IF _email IS NULL THEN RETURN; END IF;

  UPDATE public.portal_users
  SET auth_user_id = auth.uid(),
      activated_at = COALESCE(activated_at, now()),
      status = CASE WHEN status = 'invited' THEN 'active' ELSE status END,
      last_login_at = now()
  WHERE auth_user_id IS NULL
    AND lower(email) = _email
    AND status IN ('invited','active');
END;
$$;