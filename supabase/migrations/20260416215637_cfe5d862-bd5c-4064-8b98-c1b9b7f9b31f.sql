-- =========================================
-- PROJECTS TABLE
-- =========================================
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  project_name TEXT NOT NULL,
  project_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed','cancelled')),
  notes TEXT,
  start_date DATE,
  expected_end_date DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dealer_id, project_code)
);

CREATE INDEX idx_projects_dealer ON public.projects(dealer_id);
CREATE INDEX idx_projects_customer ON public.projects(dealer_id, customer_id);
CREATE INDEX idx_projects_status ON public.projects(dealer_id, status);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer admins can manage projects"
  ON public.projects FOR ALL TO authenticated
  USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role))
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Dealer users can view projects"
  ON public.projects FOR SELECT TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Salesmen can create projects"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'salesman'::app_role));

CREATE POLICY "Subscription required for projects writes"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to projects"
  ON public.projects FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- =========================================
-- PROJECT SITES TABLE
-- =========================================
CREATE TABLE public.project_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  site_name TEXT NOT NULL,
  address TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sites_dealer ON public.project_sites(dealer_id);
CREATE INDEX idx_sites_project ON public.project_sites(dealer_id, project_id);
CREATE INDEX idx_sites_customer ON public.project_sites(dealer_id, customer_id);

ALTER TABLE public.project_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer admins can manage project_sites"
  ON public.project_sites FOR ALL TO authenticated
  USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role))
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Dealer users can view project_sites"
  ON public.project_sites FOR SELECT TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Salesmen can create project_sites"
  ON public.project_sites FOR INSERT TO authenticated
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'salesman'::app_role));

CREATE POLICY "Subscription required for project_sites writes"
  ON public.project_sites FOR INSERT TO authenticated
  WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to project_sites"
  ON public.project_sites FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- =========================================
-- PROJECT CODE SEQUENCE (per-dealer counter)
-- =========================================
CREATE TABLE public.project_code_sequences (
  dealer_id UUID PRIMARY KEY REFERENCES public.dealers(id) ON DELETE CASCADE,
  next_project_no INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE public.project_code_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer users can manage own project sequences"
  ON public.project_code_sequences FOR ALL TO authenticated
  USING (dealer_id = get_user_dealer_id(auth.uid()))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Super admin full access to project_code_sequences"
  ON public.project_code_sequences FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Atomic next-code RPC (concurrency-safe)
CREATE OR REPLACE FUNCTION public.get_next_project_code(p_dealer_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO public.project_code_sequences (dealer_id, next_project_no)
  VALUES (p_dealer_id, 1)
  ON CONFLICT (dealer_id) DO NOTHING;

  UPDATE public.project_code_sequences
    SET next_project_no = next_project_no + 1
    WHERE dealer_id = p_dealer_id
    RETURNING next_project_no - 1 INTO v_next;

  RETURN 'PRJ-' || LPAD(v_next::TEXT, 4, '0');
END;
$$;

-- =========================================
-- updated_at trigger function (reuse if exists)
-- =========================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_project_sites_updated_at
  BEFORE UPDATE ON public.project_sites
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================
-- ADD project_id / site_id TO QUOTATIONS & SALES
-- =========================================
ALTER TABLE public.quotations
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN site_id UUID REFERENCES public.project_sites(id) ON DELETE SET NULL;

CREATE INDEX idx_quotations_project ON public.quotations(dealer_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_quotations_site ON public.quotations(dealer_id, site_id) WHERE site_id IS NOT NULL;

ALTER TABLE public.sales
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN site_id UUID REFERENCES public.project_sites(id) ON DELETE SET NULL;

CREATE INDEX idx_sales_project ON public.sales(dealer_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_sales_site ON public.sales(dealer_id, site_id) WHERE site_id IS NOT NULL;