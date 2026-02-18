
-- Add indexes on dealer_id for all major business tables
-- These dramatically improve query performance for tenant-scoped queries

CREATE INDEX IF NOT EXISTS idx_products_dealer_id ON public.products (dealer_id);
CREATE INDEX IF NOT EXISTS idx_sales_dealer_id ON public.sales (dealer_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON public.sales (dealer_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_dealer_id ON public.sale_items (dealer_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_purchases_dealer_id ON public.purchases (dealer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON public.purchases (dealer_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_items_dealer_id ON public.purchase_items (dealer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON public.purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_stock_dealer_id ON public.stock (dealer_id);
CREATE INDEX IF NOT EXISTS idx_stock_product_id ON public.stock (dealer_id, product_id);
CREATE INDEX IF NOT EXISTS idx_customers_dealer_id ON public.customers (dealer_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_dealer_id ON public.suppliers (dealer_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_dealer_id ON public.sales_returns (dealer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_dealer_id ON public.expenses (dealer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses (dealer_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_dealer_id ON public.customer_ledger (dealer_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON public.customer_ledger (dealer_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_dealer_id ON public.supplier_ledger (dealer_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier ON public.supplier_ledger (dealer_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_dealer_id ON public.cash_ledger (dealer_id);
CREATE INDEX IF NOT EXISTS idx_expense_ledger_dealer_id ON public.expense_ledger (dealer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_dealer_id ON public.audit_logs (dealer_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_dealer_id ON public.profiles (dealer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_dealer_id ON public.subscriptions (dealer_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);
