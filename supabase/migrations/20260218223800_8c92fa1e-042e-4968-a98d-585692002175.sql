
-- Create unified ledger type enum
CREATE TYPE public.ledger_type AS ENUM ('customer', 'supplier', 'cash', 'expense');
CREATE TYPE public.ledger_entry_type AS ENUM ('sale', 'purchase', 'payment', 'refund', 'expense', 'receipt', 'adjustment');

-- Supplier Ledger
CREATE TABLE public.supplier_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES public.purchases(id),
  type public.ledger_entry_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.supplier_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access" ON public.supplier_ledger FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.supplier_ledger FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.supplier_ledger FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));
CREATE POLICY "Salesmen can create" ON public.supplier_ledger FOR INSERT TO authenticated
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'salesman'));

-- Cash Ledger (tracks all cash in/out for the dealer)
CREATE TABLE public.cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  type public.ledger_entry_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  description TEXT,
  reference_type TEXT,
  reference_id UUID,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cash_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access" ON public.cash_ledger FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.cash_ledger FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.cash_ledger FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));
CREATE POLICY "Salesmen can create" ON public.cash_ledger FOR INSERT TO authenticated
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'salesman'));

-- Expense Ledger (wraps expenses table entries for ledger tracking)
CREATE TABLE public.expense_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT,
  description TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access" ON public.expense_ledger FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.expense_ledger FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.expense_ledger FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));

-- Add entry_date to customer_ledger for consistency
ALTER TABLE public.customer_ledger
  ADD COLUMN entry_date DATE NOT NULL DEFAULT CURRENT_DATE;
