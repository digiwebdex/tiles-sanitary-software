
-- Add IP address and user agent columns to audit_logs
ALTER TABLE public.audit_logs 
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

-- Remove the dealer user SELECT policy — only super_admin should view logs
DROP POLICY IF EXISTS "Dealer users can view own logs" ON public.audit_logs;

-- Ensure super_admin policy covers all operations
DROP POLICY IF EXISTS "Super admin full access" ON public.audit_logs;
CREATE POLICY "Super admin full access"
  ON public.audit_logs FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Allow any authenticated user to INSERT audit logs (but not read/update/delete)
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);
