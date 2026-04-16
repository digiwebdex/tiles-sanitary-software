ALTER TABLE public.dealers
  ADD COLUMN IF NOT EXISTS default_wastage_pct numeric NOT NULL DEFAULT 10;

CREATE OR REPLACE FUNCTION public.validate_dealer_default_wastage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.default_wastage_pct IS NULL THEN
    NEW.default_wastage_pct := 10;
  END IF;
  IF NEW.default_wastage_pct < 0 OR NEW.default_wastage_pct > 25 THEN
    RAISE EXCEPTION 'default_wastage_pct must be between 0 and 25 (got %)', NEW.default_wastage_pct;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_dealer_default_wastage ON public.dealers;
CREATE TRIGGER trg_validate_dealer_default_wastage
  BEFORE INSERT OR UPDATE OF default_wastage_pct ON public.dealers
  FOR EACH ROW EXECUTE FUNCTION public.validate_dealer_default_wastage();