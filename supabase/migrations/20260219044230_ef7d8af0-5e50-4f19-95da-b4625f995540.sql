-- Unique SKU per dealer constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_dealer ON public.products (dealer_id, sku);