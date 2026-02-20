
-- Add credit control fields to customers table
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_overdue_days INTEGER NOT NULL DEFAULT 0;

-- Create credit_overrides table for audit logging owner overrides
CREATE TABLE IF NOT EXISTS public.credit_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  override_reason TEXT NOT NULL,
  overridden_by UUID,
  credit_limit_at_time NUMERIC NOT NULL DEFAULT 0,
  outstanding_at_time NUMERIC NOT NULL DEFAULT 0,
  new_due_at_time NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on credit_overrides
ALTER TABLE public.credit_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer admins can manage credit_overrides"
  ON public.credit_overrides FOR ALL
  USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Dealer users can view credit_overrides"
  ON public.credit_overrides FOR SELECT
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Super admin full access to credit_overrides"
  ON public.credit_overrides FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_credit_overrides_dealer_customer ON public.credit_overrides(dealer_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_overrides_sale ON public.credit_overrides(sale_id);
