
-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE public.notifications (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id     uuid NOT NULL REFERENCES public.dealers(id),
  channel       text NOT NULL CHECK (channel IN ('sms', 'email')),
  type          text NOT NULL CHECK (type IN ('sale_created', 'daily_summary')),
  payload       jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  retry_count   integer NOT NULL DEFAULT 0,
  error_message text,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  sent_at       timestamp with time zone
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer admins can manage notifications"
  ON public.notifications FOR ALL
  USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Dealer users can view notifications"
  ON public.notifications FOR SELECT
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Super admin full access to notifications"
  ON public.notifications FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Edge functions can insert notifications (service role bypasses RLS anyway)
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- =============================================
-- NOTIFICATION SETTINGS TABLE
-- =============================================
CREATE TABLE public.notification_settings (
  dealer_id                   uuid NOT NULL PRIMARY KEY REFERENCES public.dealers(id),
  enable_sale_sms             boolean NOT NULL DEFAULT true,
  enable_sale_email           boolean NOT NULL DEFAULT true,
  enable_daily_summary_sms    boolean NOT NULL DEFAULT true,
  enable_daily_summary_email  boolean NOT NULL DEFAULT true,
  owner_phone                 text,
  owner_email                 text,
  created_at                  timestamp with time zone NOT NULL DEFAULT now(),
  updated_at                  timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer admins can manage notification_settings"
  ON public.notification_settings FOR ALL
  USING ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK ((dealer_id = get_user_dealer_id(auth.uid())) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Dealer users can view notification_settings"
  ON public.notification_settings FOR SELECT
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Super admin full access to notification_settings"
  ON public.notification_settings FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Auto-update updated_at
CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- INDEX for faster status queries
-- =============================================
CREATE INDEX idx_notifications_dealer_status ON public.notifications(dealer_id, status);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
