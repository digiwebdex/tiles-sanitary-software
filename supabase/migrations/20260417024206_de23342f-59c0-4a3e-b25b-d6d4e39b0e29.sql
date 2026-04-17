-- ============================================================
-- Commission / Referral Tracking - Batch 1 schema
-- ============================================================

-- Enum for referral source type
DO $$ BEGIN
  CREATE TYPE public.referral_source_type AS ENUM (
    'salesman','architect','contractor','mason','fitter','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum for commission type
DO $$ BEGIN
  CREATE TYPE public.commission_type AS ENUM ('percent','fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum for commission status
DO $$ BEGIN
  CREATE TYPE public.commission_status AS ENUM (
    'pending','earned','settled','cancelled','adjusted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------
-- referral_sources
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  source_type public.referral_source_type NOT NULL DEFAULT 'other',
  name text NOT NULL,
  phone text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  default_commission_type public.commission_type,
  default_commission_value numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_sources_dealer_name_unique UNIQUE (dealer_id, name)
);

CREATE INDEX IF NOT EXISTS idx_referral_sources_dealer ON public.referral_sources(dealer_id);
CREATE INDEX IF NOT EXISTS idx_referral_sources_active ON public.referral_sources(dealer_id, active);

ALTER TABLE public.referral_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealer admins can manage referral_sources" ON public.referral_sources;
CREATE POLICY "Dealer admins can manage referral_sources"
ON public.referral_sources FOR ALL TO authenticated
USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(),'dealer_admin'::app_role))
WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(),'dealer_admin'::app_role));

DROP POLICY IF EXISTS "Dealer users can view referral_sources" ON public.referral_sources;
CREATE POLICY "Dealer users can view referral_sources"
ON public.referral_sources FOR SELECT TO authenticated
USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Subscription required for referral_sources writes" ON public.referral_sources;
CREATE POLICY "Subscription required for referral_sources writes"
ON public.referral_sources FOR INSERT TO authenticated
WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Super admin full access referral_sources" ON public.referral_sources;
CREATE POLICY "Super admin full access referral_sources"
ON public.referral_sources FOR ALL TO authenticated
USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ----------------------------------------------------------------
-- sale_commissions
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  referral_source_id uuid NOT NULL REFERENCES public.referral_sources(id) ON DELETE RESTRICT,
  commission_type public.commission_type NOT NULL DEFAULT 'percent',
  commission_value numeric(12,2) NOT NULL DEFAULT 0,
  commission_base_amount numeric(14,2) NOT NULL DEFAULT 0,
  calculated_commission_amount numeric(14,2) NOT NULL DEFAULT 0,
  status public.commission_status NOT NULL DEFAULT 'pending',
  payable_at timestamptz,
  settled_at timestamptz,
  settled_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_commissions_sale_unique UNIQUE (sale_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_commissions_dealer ON public.sale_commissions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_sale_commissions_sale ON public.sale_commissions(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_commissions_referral ON public.sale_commissions(referral_source_id);
CREATE INDEX IF NOT EXISTS idx_sale_commissions_status ON public.sale_commissions(dealer_id, status);

ALTER TABLE public.sale_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealer admins can manage sale_commissions" ON public.sale_commissions;
CREATE POLICY "Dealer admins can manage sale_commissions"
ON public.sale_commissions FOR ALL TO authenticated
USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(),'dealer_admin'::app_role))
WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(),'dealer_admin'::app_role));

DROP POLICY IF EXISTS "Dealer users can view sale_commissions" ON public.sale_commissions;
CREATE POLICY "Dealer users can view sale_commissions"
ON public.sale_commissions FOR SELECT TO authenticated
USING (dealer_id = get_user_dealer_id(auth.uid()));

DROP POLICY IF EXISTS "Salesmen can create sale_commissions" ON public.sale_commissions;
CREATE POLICY "Salesmen can create sale_commissions"
ON public.sale_commissions FOR INSERT TO authenticated
WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(),'salesman'::app_role));

DROP POLICY IF EXISTS "Subscription required for sale_commissions writes" ON public.sale_commissions;
CREATE POLICY "Subscription required for sale_commissions writes"
ON public.sale_commissions FOR INSERT TO authenticated
WITH CHECK (has_active_subscription());

DROP POLICY IF EXISTS "Super admin full access sale_commissions" ON public.sale_commissions;
CREATE POLICY "Super admin full access sale_commissions"
ON public.sale_commissions FOR ALL TO authenticated
USING (is_super_admin()) WITH CHECK (is_super_admin());

-- ----------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_sources_updated_at ON public.referral_sources;
CREATE TRIGGER trg_referral_sources_updated_at
BEFORE UPDATE ON public.referral_sources
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_sale_commissions_updated_at ON public.sale_commissions;
CREATE TRIGGER trg_sale_commissions_updated_at
BEFORE UPDATE ON public.sale_commissions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();