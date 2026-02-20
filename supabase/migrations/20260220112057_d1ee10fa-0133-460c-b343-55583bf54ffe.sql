
-- Create subscription_plans table with feature flags
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  monthly_price numeric NOT NULL DEFAULT 0,
  yearly_price numeric NOT NULL DEFAULT 0,
  max_users integer NOT NULL DEFAULT 1,
  sms_enabled boolean NOT NULL DEFAULT false,
  email_enabled boolean NOT NULL DEFAULT false,
  daily_summary_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Public can read active plans (pricing page)
CREATE POLICY "Public can read subscription_plans"
  ON public.subscription_plans FOR SELECT
  USING (true);

-- Only super admin can manage plans
CREATE POLICY "Super admin full access to subscription_plans"
  ON public.subscription_plans FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Trigger to auto-update updated_at
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Insert Basic plan
INSERT INTO public.subscription_plans (name, monthly_price, yearly_price, max_users, sms_enabled, email_enabled, daily_summary_enabled)
VALUES (
  'Basic',
  1000,
  8400,
  2,
  false,
  false,
  false
);

-- Insert Pro plan
INSERT INTO public.subscription_plans (name, monthly_price, yearly_price, max_users, sms_enabled, email_enabled, daily_summary_enabled)
VALUES (
  'Pro',
  2000,
  16800,
  5,
  true,
  true,
  true
);
