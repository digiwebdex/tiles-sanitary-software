
-- Add status column to dealers for activate/suspend functionality
ALTER TABLE public.dealers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Add super_admin write policies to plans table
CREATE POLICY "Super admin full access to plans"
ON public.plans
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());
