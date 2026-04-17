-- Enum for WhatsApp message types
DO $$ BEGIN
  CREATE TYPE public.whatsapp_message_type AS ENUM (
    'quotation_share',
    'invoice_share',
    'payment_receipt',
    'overdue_reminder',
    'delivery_update'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum for message status
DO $$ BEGIN
  CREATE TYPE public.whatsapp_message_status AS ENUM (
    'pending',
    'manual_handoff',
    'sent',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main log table
CREATE TABLE IF NOT EXISTS public.whatsapp_message_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  message_type public.whatsapp_message_type NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  recipient_phone text NOT NULL,
  recipient_name text,
  template_key text,
  message_text text NOT NULL,
  payload_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.whatsapp_message_status NOT NULL DEFAULT 'pending',
  provider text NOT NULL DEFAULT 'wa_click_to_chat',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_wa_logs_dealer_created ON public.whatsapp_message_logs(dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_logs_dealer_type ON public.whatsapp_message_logs(dealer_id, message_type);
CREATE INDEX IF NOT EXISTS idx_wa_logs_dealer_status ON public.whatsapp_message_logs(dealer_id, status);
CREATE INDEX IF NOT EXISTS idx_wa_logs_source ON public.whatsapp_message_logs(source_type, source_id);

ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;

-- Super admin: full access
CREATE POLICY "wa_logs_super_admin_all"
ON public.whatsapp_message_logs
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Dealer admin: view all dealer logs
CREATE POLICY "wa_logs_dealer_admin_select"
ON public.whatsapp_message_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'dealer_admin'::public.app_role)
  AND dealer_id = public.get_user_dealer_id(auth.uid())
);

-- Dealer admin: insert
CREATE POLICY "wa_logs_dealer_admin_insert"
ON public.whatsapp_message_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'dealer_admin'::public.app_role)
  AND dealer_id = public.get_user_dealer_id(auth.uid())
);

-- Dealer admin: update (for status transitions / retries)
CREATE POLICY "wa_logs_dealer_admin_update"
ON public.whatsapp_message_logs
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'dealer_admin'::public.app_role)
  AND dealer_id = public.get_user_dealer_id(auth.uid())
)
WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()));

-- Salesman: view only own sends
CREATE POLICY "wa_logs_salesman_select_own"
ON public.whatsapp_message_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'salesman'::public.app_role)
  AND dealer_id = public.get_user_dealer_id(auth.uid())
  AND created_by = auth.uid()
);

-- Salesman: insert own sends
CREATE POLICY "wa_logs_salesman_insert"
ON public.whatsapp_message_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'salesman'::public.app_role)
  AND dealer_id = public.get_user_dealer_id(auth.uid())
  AND created_by = auth.uid()
);

-- Salesman: update own sends (mark sent/failed)
CREATE POLICY "wa_logs_salesman_update_own"
ON public.whatsapp_message_logs
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'salesman'::public.app_role)
  AND dealer_id = public.get_user_dealer_id(auth.uid())
  AND created_by = auth.uid()
)
WITH CHECK (
  dealer_id = public.get_user_dealer_id(auth.uid())
  AND created_by = auth.uid()
);