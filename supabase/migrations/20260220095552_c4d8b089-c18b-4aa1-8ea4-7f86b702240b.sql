
-- Contact form submissions table
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_name text,
  phone text,
  email text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public contact form)
CREATE POLICY "Public can submit contact form"
  ON public.contact_submissions FOR INSERT
  WITH CHECK (true);

-- Only super_admin can read submissions
CREATE POLICY "Super admin can read all submissions"
  ON public.contact_submissions FOR SELECT
  USING (public.is_super_admin());

-- Super admin can update status
CREATE POLICY "Super admin can update submissions"
  ON public.contact_submissions FOR UPDATE
  USING (public.is_super_admin());
