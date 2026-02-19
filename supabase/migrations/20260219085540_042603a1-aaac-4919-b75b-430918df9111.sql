
-- Create enums for payment method and status
CREATE TYPE public.payment_method_type AS ENUM ('cash', 'bank', 'mobile_banking');
CREATE TYPE public.payment_status_type AS ENUM ('paid', 'partial', 'pending');

-- Create subscription_payments table
CREATE TABLE public.subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method payment_method_type NOT NULL,
  payment_status payment_status_type NOT NULL DEFAULT 'pending',
  collected_by UUID REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Super admin only access
CREATE POLICY "Super admin full access"
ON public.subscription_payments
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());
