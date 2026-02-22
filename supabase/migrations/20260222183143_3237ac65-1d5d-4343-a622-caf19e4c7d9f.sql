
-- 1. Add sale_type and sale_status to sales table
ALTER TABLE public.sales 
  ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'direct_invoice',
  ADD COLUMN IF NOT EXISTS sale_status text NOT NULL DEFAULT 'invoiced';

-- 2. Create challans table
CREATE TABLE IF NOT EXISTS public.challans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id),
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  challan_no text NOT NULL,
  challan_date date NOT NULL DEFAULT CURRENT_DATE,
  driver_name text,
  transport_name text,
  vehicle_no text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(dealer_id, challan_no)
);

-- Enable RLS on challans
ALTER TABLE public.challans ENABLE ROW LEVEL SECURITY;

-- RLS policies for challans
CREATE POLICY "Dealer admins can manage challans" ON public.challans
  FOR ALL USING (
    dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'::app_role)
  ) WITH CHECK (
    dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'::app_role)
  );

CREATE POLICY "Dealer users can view challans" ON public.challans
  FOR SELECT USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Salesmen can create challans" ON public.challans
  FOR INSERT WITH CHECK (
    dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'::app_role)
  );

CREATE POLICY "Super admin full access to challans" ON public.challans
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "Subscription required for challan writes" ON public.challans
  FOR INSERT WITH CHECK (has_active_subscription());

-- 3. Add reserved columns to stock table
ALTER TABLE public.stock
  ADD COLUMN IF NOT EXISTS reserved_box_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_piece_qty numeric NOT NULL DEFAULT 0;

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_challans_dealer_id ON public.challans(dealer_id);
CREATE INDEX IF NOT EXISTS idx_challans_sale_id ON public.challans(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_type ON public.sales(sale_type);
CREATE INDEX IF NOT EXISTS idx_sales_sale_status ON public.sales(sale_status);
