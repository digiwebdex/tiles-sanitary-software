ALTER TABLE public.quotation_items
ADD COLUMN IF NOT EXISTS measurement_snapshot JSONB DEFAULT NULL;

COMMENT ON COLUMN public.quotation_items.measurement_snapshot IS
'Area Calculator snapshot: { measurement_type, room_name, input_unit (ft|m), area_unit (sft|sqm), floor_length, floor_width, wall_height, walls[], deductions[], gross_area_sft, deduction_area_sft, net_area_sft, wastage_pct, final_area_sft, per_box_sft_snapshot, calculated_boxes, final_boxes, manual_override, override_reason, notes }';