
-- Display Stock: tracks units physically on showroom display (separate from sellable)
CREATE TABLE public.display_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  display_qty NUMERIC NOT NULL DEFAULT 0 CHECK (display_qty >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dealer_id, product_id)
);

CREATE INDEX idx_display_stock_dealer ON public.display_stock(dealer_id);
CREATE INDEX idx_display_stock_product ON public.display_stock(product_id);

ALTER TABLE public.display_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users can view display_stock"
ON public.display_stock FOR SELECT TO authenticated
USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer admins can manage display_stock"
ON public.display_stock FOR ALL TO authenticated
USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role))
WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Super admin full access to display_stock"
ON public.display_stock FOR ALL TO authenticated
USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Subscription required for display_stock writes"
ON public.display_stock FOR INSERT TO authenticated
WITH CHECK (has_active_subscription());

-- Display Movements: audit log of every sellable<->display transition
CREATE TYPE public.display_movement_type AS ENUM ('to_display', 'from_display', 'display_damaged', 'display_replaced');

CREATE TABLE public.display_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type public.display_movement_type NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_display_movements_dealer ON public.display_movements(dealer_id);
CREATE INDEX idx_display_movements_product ON public.display_movements(product_id);
CREATE INDEX idx_display_movements_created ON public.display_movements(created_at DESC);

ALTER TABLE public.display_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users can view display_movements"
ON public.display_movements FOR SELECT TO authenticated
USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer admins can manage display_movements"
ON public.display_movements FOR ALL TO authenticated
USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role))
WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Super admin full access to display_movements"
ON public.display_movements FOR ALL TO authenticated
USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Subscription required for display_movements writes"
ON public.display_movements FOR INSERT TO authenticated
WITH CHECK (has_active_subscription());

-- Sample Issues: track samples handed out to customers/architects/contractors
CREATE TYPE public.sample_issue_status AS ENUM ('issued', 'returned', 'partially_returned', 'damaged', 'lost');
CREATE TYPE public.sample_recipient_type AS ENUM ('customer', 'architect', 'contractor', 'mason', 'other');

CREATE TABLE public.sample_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  returned_qty NUMERIC NOT NULL DEFAULT 0 CHECK (returned_qty >= 0),
  damaged_qty NUMERIC NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
  lost_qty NUMERIC NOT NULL DEFAULT 0 CHECK (lost_qty >= 0),
  recipient_type public.sample_recipient_type NOT NULL DEFAULT 'customer',
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date DATE,
  returned_date DATE,
  status public.sample_issue_status NOT NULL DEFAULT 'issued',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sample_issues_dealer ON public.sample_issues(dealer_id);
CREATE INDEX idx_sample_issues_product ON public.sample_issues(product_id);
CREATE INDEX idx_sample_issues_status ON public.sample_issues(status);
CREATE INDEX idx_sample_issues_customer ON public.sample_issues(customer_id);

ALTER TABLE public.sample_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users can view sample_issues"
ON public.sample_issues FOR SELECT TO authenticated
USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Dealer admins can manage sample_issues"
ON public.sample_issues FOR ALL TO authenticated
USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role))
WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Salesmen can create sample_issues"
ON public.sample_issues FOR INSERT TO authenticated
WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'salesman'::app_role));

CREATE POLICY "Super admin full access to sample_issues"
ON public.sample_issues FOR ALL TO authenticated
USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Subscription required for sample_issues writes"
ON public.sample_issues FOR INSERT TO authenticated
WITH CHECK (has_active_subscription());
