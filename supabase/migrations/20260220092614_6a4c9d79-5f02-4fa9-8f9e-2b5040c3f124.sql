
-- Create website_content table for Landing Page CMS
CREATE TABLE public.website_content (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key text NOT NULL UNIQUE,
  title text,
  subtitle text,
  description text,
  button_text text,
  button_link text,
  extra_json jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.website_content ENABLE ROW LEVEL SECURITY;

-- Public can read (for landing page rendering)
CREATE POLICY "Public can read website_content"
  ON public.website_content
  FOR SELECT
  USING (true);

-- Only super admin can manage
CREATE POLICY "Super admin full access to website_content"
  ON public.website_content
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Auto-update updated_at
CREATE TRIGGER update_website_content_updated_at
  BEFORE UPDATE ON public.website_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Insert default sections
INSERT INTO public.website_content (section_key, title, subtitle, description, button_text, button_link, extra_json) VALUES
  ('hero', 'Manage Your Tile Business Smarter', 'All-in-one ERP for Tiles & Sanitary Dealers', 'Track inventory, manage sales, monitor finances — built specifically for tiles and sanitary businesses.', 'Get Started', '/login', '{"badge": "Trusted by 100+ Dealers"}'::jsonb),
  ('features', 'Everything You Need', 'Powerful features for modern dealers', 'From inventory management to financial reporting, we have got every aspect of your business covered.', 'Explore Features', '#features', '{}'::jsonb),
  ('pricing', 'Simple, Transparent Pricing', 'No hidden fees. Pay as you grow.', 'Choose a plan that fits your business. Upgrade or downgrade at any time.', 'View Plans', '#pricing', '{}'::jsonb),
  ('security', 'Enterprise-Grade Security', 'Your data is safe with us', 'Bank-level encryption, role-based access control, and audit logs keep your business data protected.', 'Learn More', '#security', '{}'::jsonb),
  ('about', 'About Us', 'Built by dealers, for dealers', 'We understand the tiles and sanitary business because we have been there. Our ERP is designed from the ground up for your industry.', 'Our Story', '#about', '{}'::jsonb),
  ('contact', 'Get in Touch', 'We are here to help', 'Have questions? Our support team is ready to assist you with onboarding, training, and technical support.', 'Contact Us', '#contact', '{"email": "support@example.com", "phone": "+880 1234-567890"}'::jsonb),
  ('footer', 'Tiles & Sanitary ERP', NULL, 'The modern ERP platform for tiles and sanitary dealers across Bangladesh.', NULL, NULL, '{"copyright": "© 2025 Tiles ERP. All rights reserved."}'::jsonb),
  ('seo', 'Tiles & Sanitary ERP - Manage Your Business', NULL, 'All-in-one ERP for tiles and sanitary dealers. Manage inventory, sales, purchases, and finances in one place.', NULL, NULL, '{"og_image": "", "keywords": "tiles ERP, sanitary software, dealer management, inventory"}'::jsonb)
ON CONFLICT (section_key) DO NOTHING;
