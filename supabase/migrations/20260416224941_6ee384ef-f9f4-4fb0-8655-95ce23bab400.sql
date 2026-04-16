-- Project / Site-wise Sales — Batch 2 schema
-- Extend challans and deliveries with optional project/site linkage so the
-- linkage that already exists on sales/quotations can flow through the
-- delivery pipeline.

-- 1) challans
ALTER TABLE public.challans
  ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_id    uuid NULL REFERENCES public.project_sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_challans_project_id ON public.challans(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_challans_site_id    ON public.challans(site_id)    WHERE site_id    IS NOT NULL;

-- 2) deliveries
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_id    uuid NULL REFERENCES public.project_sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deliveries_project_id ON public.deliveries(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deliveries_site_id    ON public.deliveries(site_id)    WHERE site_id    IS NOT NULL;

-- 3) Backfill existing rows from their parent sale (one-time)
UPDATE public.challans c
SET project_id = s.project_id, site_id = s.site_id
FROM public.sales s
WHERE c.sale_id = s.id
  AND c.project_id IS NULL
  AND s.project_id IS NOT NULL;

UPDATE public.deliveries d
SET project_id = s.project_id, site_id = s.site_id
FROM public.sales s
WHERE d.sale_id = s.id
  AND d.project_id IS NULL
  AND s.project_id IS NOT NULL;