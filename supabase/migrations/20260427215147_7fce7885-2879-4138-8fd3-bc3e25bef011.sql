-- ── 1. Concurrency-safe sequence functions ─────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_next_invoice_no(_dealer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _next integer;
BEGIN
  INSERT INTO public.invoice_sequences (dealer_id, next_invoice_no)
  VALUES (_dealer_id, 1)
  ON CONFLICT (dealer_id) DO NOTHING;

  PERFORM 1 FROM public.invoice_sequences
    WHERE dealer_id = _dealer_id FOR UPDATE;

  UPDATE public.invoice_sequences
    SET next_invoice_no = next_invoice_no + 1
    WHERE dealer_id = _dealer_id
    RETURNING next_invoice_no - 1 INTO _next;

  RETURN 'INV-' || lpad(_next::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_next_challan_no(_dealer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _next integer;
BEGIN
  INSERT INTO public.invoice_sequences (dealer_id, next_challan_no)
  VALUES (_dealer_id, 1)
  ON CONFLICT (dealer_id) DO NOTHING;

  PERFORM 1 FROM public.invoice_sequences
    WHERE dealer_id = _dealer_id FOR UPDATE;

  UPDATE public.invoice_sequences
    SET next_challan_no = next_challan_no + 1
    WHERE dealer_id = _dealer_id
    RETURNING next_challan_no - 1 INTO _next;

  RETURN 'CH-' || lpad(_next::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_next_quotation_no(_dealer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _next integer;
BEGIN
  INSERT INTO public.invoice_sequences (dealer_id, next_quotation_no)
  VALUES (_dealer_id, 1)
  ON CONFLICT (dealer_id) DO NOTHING;

  PERFORM 1 FROM public.invoice_sequences
    WHERE dealer_id = _dealer_id FOR UPDATE;

  UPDATE public.invoice_sequences
    SET next_quotation_no = next_quotation_no + 1
    WHERE dealer_id = _dealer_id
    RETURNING next_quotation_no - 1 INTO _next;

  RETURN 'Q-' || lpad(_next::text, 5, '0');
END;
$$;

-- ── 2. Delivery / batch allocation integrity ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'delivery_item_batches'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_delivery_item_batch'
  ) THEN
    CREATE UNIQUE INDEX uniq_delivery_item_batch
      ON public.delivery_item_batches (delivery_item_id, batch_id);
  END IF;
END $$;

-- ── 3. WhatsApp send idempotency ──────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'whatsapp_message_logs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'whatsapp_message_logs'
      AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE public.whatsapp_message_logs
      ADD COLUMN idempotency_key text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_whatsapp_idem
  ON public.whatsapp_message_logs (dealer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── 4. SMS send log with idempotency ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sms_message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  to_phone text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  source_type text,
  source_id uuid,
  provider_response text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_idem
  ON public.sms_message_logs (dealer_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_sms_logs_dealer_created
  ON public.sms_message_logs (dealer_id, created_at DESC);

ALTER TABLE public.sms_message_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dealer admins can view their SMS logs" ON public.sms_message_logs;
CREATE POLICY "Dealer admins can view their SMS logs"
  ON public.sms_message_logs FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.has_role(auth.uid(), 'dealer_admin'::app_role)
      AND public.get_user_dealer_id(auth.uid()) = dealer_id
    )
  );

DROP POLICY IF EXISTS "Dealer users can insert their SMS logs" ON public.sms_message_logs;
CREATE POLICY "Dealer users can insert their SMS logs"
  ON public.sms_message_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.get_user_dealer_id(auth.uid()) = dealer_id
  );
