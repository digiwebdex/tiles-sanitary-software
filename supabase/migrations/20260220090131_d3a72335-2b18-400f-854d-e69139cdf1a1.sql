-- Add gross_profit and net_profit columns to sales table
-- gross_profit = total_amount - cogs (revenue minus cost of goods sold)
-- net_profit = gross_profit - any additional overhead (currently same as gross_profit since overhead is in landed_cost)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS gross_profit NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_profit   NUMERIC NOT NULL DEFAULT 0;

-- Backfill existing rows: set gross_profit and net_profit = existing profit column
UPDATE public.sales
SET 
  gross_profit = profit,
  net_profit   = profit
WHERE gross_profit = 0 AND net_profit = 0;