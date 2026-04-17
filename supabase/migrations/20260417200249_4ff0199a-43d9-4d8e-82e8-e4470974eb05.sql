CREATE TABLE IF NOT EXISTS public.demand_planning_settings (
  dealer_id uuid PRIMARY KEY REFERENCES public.dealers(id) ON DELETE CASCADE,
  velocity_window_days integer NOT NULL DEFAULT 30,
  stockout_cover_days integer NOT NULL DEFAULT 7,
  reorder_cover_days integer NOT NULL DEFAULT 14,
  target_cover_days integer NOT NULL DEFAULT 30,
  fast_moving_30d_qty integer NOT NULL DEFAULT 20,
  slow_moving_30d_max integer NOT NULL DEFAULT 5,
  dead_stock_days integer NOT NULL DEFAULT 90,
  incoming_window_days integer NOT NULL DEFAULT 30,
  safety_stock_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demand_planning_settings_ranges CHECK (
    velocity_window_days BETWEEN 7 AND 365
    AND stockout_cover_days BETWEEN 1 AND 60
    AND reorder_cover_days BETWEEN 1 AND 90
    AND target_cover_days BETWEEN 7 AND 180
    AND fast_moving_30d_qty BETWEEN 1 AND 100000
    AND slow_moving_30d_max BETWEEN 0 AND 100000
    AND dead_stock_days BETWEEN 14 AND 730
    AND incoming_window_days BETWEEN 7 AND 180
    AND safety_stock_days BETWEEN 0 AND 90
  )
);

ALTER TABLE public.demand_planning_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer admins can manage demand_planning_settings"
  ON public.demand_planning_settings FOR ALL TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'::app_role))
  WITH CHECK (dealer_id = public.get_user_dealer_id(auth.uid()) AND public.has_role(auth.uid(), 'dealer_admin'::app_role));

CREATE POLICY "Dealer users can view demand_planning_settings"
  ON public.demand_planning_settings FOR SELECT TO authenticated
  USING (dealer_id = public.get_user_dealer_id(auth.uid()));

CREATE POLICY "Super admin full access to demand_planning_settings"
  ON public.demand_planning_settings FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.touch_demand_planning_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS demand_planning_settings_touch ON public.demand_planning_settings;
CREATE TRIGGER demand_planning_settings_touch
  BEFORE UPDATE ON public.demand_planning_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_demand_planning_settings_updated_at();