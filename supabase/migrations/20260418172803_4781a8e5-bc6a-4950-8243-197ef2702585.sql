
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  dealer_id uuid PRIMARY KEY REFERENCES public.dealers(id) ON DELETE CASCADE,
  enable_quotation_share boolean NOT NULL DEFAULT true,
  enable_invoice_share boolean NOT NULL DEFAULT true,
  enable_payment_receipt boolean NOT NULL DEFAULT true,
  enable_overdue_reminder boolean NOT NULL DEFAULT true,
  enable_delivery_update boolean NOT NULL DEFAULT true,
  template_quotation_share text,
  template_invoice_share text,
  template_payment_receipt text,
  template_overdue_reminder text,
  template_delivery_update text,
  prefer_manual_send boolean NOT NULL DEFAULT true,
  default_country_code text NOT NULL DEFAULT '880',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer admins can manage whatsapp_settings"
  ON public.whatsapp_settings
  FOR ALL
  TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'::public.app_role))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'::public.app_role));

CREATE POLICY "Dealer users can view whatsapp_settings"
  ON public.whatsapp_settings
  FOR SELECT
  TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));

CREATE POLICY "Super admin full access to whatsapp_settings"
  ON public.whatsapp_settings
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.touch_whatsapp_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_settings_touch ON public.whatsapp_settings;
CREATE TRIGGER trg_whatsapp_settings_touch
BEFORE UPDATE ON public.whatsapp_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_whatsapp_settings_updated_at();
