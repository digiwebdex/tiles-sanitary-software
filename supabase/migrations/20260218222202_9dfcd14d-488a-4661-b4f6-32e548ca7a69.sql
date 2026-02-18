
-- 1. Category enum
CREATE TYPE public.product_category AS ENUM ('tiles', 'sanitary');

-- 2. Unit type enum
CREATE TYPE public.unit_type AS ENUM ('box_sft', 'piece');

-- 3. Customer type enum
CREATE TYPE public.customer_type AS ENUM ('retailer', 'customer', 'project');

-- 4. Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category public.product_category NOT NULL,
  size TEXT,
  color TEXT,
  unit_type public.unit_type NOT NULL DEFAULT 'box_sft',
  per_box_sft NUMERIC(10,2),
  default_sale_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dealer_id, sku)
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 5. Stock
CREATE TABLE public.stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  box_qty NUMERIC(10,2) NOT NULL DEFAULT 0,
  sft_qty NUMERIC(10,2) NOT NULL DEFAULT 0,
  piece_qty NUMERIC(10,2) NOT NULL DEFAULT 0,
  average_cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, dealer_id)
);
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;

-- 6. Suppliers
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  gstin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- 7. Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  type public.customer_type NOT NULL DEFAULT 'customer',
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 8. Purchases
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  invoice_number TEXT,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- 9. Purchase Items
CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL DEFAULT 0
);
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

-- 10. Sales
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  invoice_number TEXT,
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- 11. Sale Items
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL DEFAULT 0
);
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- 12. Sales Returns
CREATE TABLE public.sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  qty NUMERIC(10,2) NOT NULL,
  reason TEXT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;

-- 13. Expenses
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- 14. Audit Logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES public.dealers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 15. RLS: dealer-scoped read/write for all business tables
-- Using a DO block to apply uniform policies

-- Products
CREATE POLICY "Super admin full access" ON public.products FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.products FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.products FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));

-- Stock
CREATE POLICY "Super admin full access" ON public.stock FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.stock FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.stock FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));

-- Suppliers
CREATE POLICY "Super admin full access" ON public.suppliers FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.suppliers FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.suppliers FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));

-- Customers
CREATE POLICY "Super admin full access" ON public.customers FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.customers FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.customers FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));

-- Purchases
CREATE POLICY "Super admin full access" ON public.purchases FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.purchases FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.purchases FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));
CREATE POLICY "Salesmen can create" ON public.purchases FOR INSERT TO authenticated
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'salesman'));

-- Purchase Items
CREATE POLICY "Super admin full access" ON public.purchase_items FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.purchase_items FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.purchase_items FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));
CREATE POLICY "Salesmen can create" ON public.purchase_items FOR INSERT TO authenticated
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'salesman'));

-- Sales
CREATE POLICY "Super admin full access" ON public.sales FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.sales FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.sales FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));
CREATE POLICY "Salesmen can create" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'salesman'));

-- Sale Items
CREATE POLICY "Super admin full access" ON public.sale_items FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.sale_items FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.sale_items FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));
CREATE POLICY "Salesmen can create" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'salesman'));

-- Sales Returns
CREATE POLICY "Super admin full access" ON public.sales_returns FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.sales_returns FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.sales_returns FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));

-- Expenses
CREATE POLICY "Super admin full access" ON public.expenses FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view" ON public.expenses FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));
CREATE POLICY "Dealer admins can manage" ON public.expenses FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'));

-- Audit Logs (read-only for dealer users, full for super admin)
CREATE POLICY "Super admin full access" ON public.audit_logs FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Dealer users can view own logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));

-- 16. Updated_at trigger for stock
CREATE TRIGGER update_stock_updated_at
  BEFORE UPDATE ON public.stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
