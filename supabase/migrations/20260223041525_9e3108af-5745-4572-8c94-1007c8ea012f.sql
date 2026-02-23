
-- Purchase Returns tables
CREATE TABLE purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id),
  purchase_id UUID REFERENCES purchases(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_no TEXT NOT NULL,
  total_amount NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'completed',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE purchase_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  dealer_id UUID NOT NULL REFERENCES dealers(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity NUMERIC(10,2) DEFAULT 0,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  reason TEXT
);

CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES dealers(id),
  challan_id UUID REFERENCES challans(id),
  sale_id UUID REFERENCES sales(id),
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'pending',
  receiver_name TEXT,
  receiver_phone TEXT,
  delivery_address TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_purchase_returns_dealer_id ON purchase_returns(dealer_id);
CREATE INDEX idx_purchase_return_items_return_id ON purchase_return_items(purchase_return_id);
CREATE INDEX idx_deliveries_dealer_id ON deliveries(dealer_id);

-- Enable RLS
ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

-- RLS for purchase_returns
CREATE POLICY "Dealer admins can manage purchase_returns" ON purchase_returns
  FOR ALL USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Dealer users can view purchase_returns" ON purchase_returns
  FOR SELECT USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Salesmen can create purchase_returns" ON purchase_returns
  FOR INSERT WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

CREATE POLICY "Subscription required for purchase_returns writes" ON purchase_returns
  FOR INSERT WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to purchase_returns" ON purchase_returns
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- RLS for purchase_return_items
CREATE POLICY "Dealer admins can manage purchase_return_items" ON purchase_return_items
  FOR ALL USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Dealer users can view purchase_return_items" ON purchase_return_items
  FOR SELECT USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Salesmen can create purchase_return_items" ON purchase_return_items
  FOR INSERT WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

CREATE POLICY "Subscription required for purchase_return_items writes" ON purchase_return_items
  FOR INSERT WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to purchase_return_items" ON purchase_return_items
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

-- RLS for deliveries
CREATE POLICY "Dealer admins can manage deliveries" ON deliveries
  FOR ALL USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Dealer users can view deliveries" ON deliveries
  FOR SELECT USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Salesmen can create deliveries" ON deliveries
  FOR INSERT WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'salesman'));

CREATE POLICY "Subscription required for delivery writes" ON deliveries
  FOR INSERT WITH CHECK (has_active_subscription());

CREATE POLICY "Super admin full access to deliveries" ON deliveries
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
