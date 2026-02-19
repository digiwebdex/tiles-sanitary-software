
-- ─── Extend suppliers table ──────────────────────────────────────────────────
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS contact_person  text,
  ADD COLUMN IF NOT EXISTS email           text,
  ADD COLUMN IF NOT EXISTS opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status          text          NOT NULL DEFAULT 'active';

-- Prevent duplicate supplier name per dealer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'suppliers_dealer_id_name_key'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_dealer_id_name_key UNIQUE (dealer_id, name);
  END IF;
END$$;

-- ─── Opening balance → supplier_ledger trigger ───────────────────────────────
-- When a supplier is created with opening_balance > 0, auto-insert a ledger
-- entry of type 'adjustment' representing the initial payable balance.

CREATE OR REPLACE FUNCTION public.supplier_opening_balance_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.opening_balance IS NOT NULL AND NEW.opening_balance <> 0 THEN
    INSERT INTO public.supplier_ledger (
      dealer_id, supplier_id, type, amount, description, entry_date
    ) VALUES (
      NEW.dealer_id,
      NEW.id,
      'adjustment',
      NEW.opening_balance,
      'Opening balance',
      CURRENT_DATE
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_opening_balance ON public.suppliers;
CREATE TRIGGER trg_supplier_opening_balance
  AFTER INSERT ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.supplier_opening_balance_ledger();
