/**
 * Area Calculator engine — pure functions only.
 *
 * UNIT MODEL (locked):
 *  - Floor / Wall input dimensions are in LINEAR units: ft or m
 *  - Direct Area mode input is in AREA units: sft or sqm
 *  - Internal storage is always sft (matches products.per_box_sft)
 *
 * Conversions:
 *  - 1 m  = 3.28084 ft         → length conversion
 *  - 1 m² = 10.7639 sft        → area conversion
 *  - sqm input → sft           → multiply by 10.7639
 *  - ft input dims → sft area  → length × width directly
 *  - m input dims  → sft area  → (l_m × w_m) × 10.7639
 */

export const FT_PER_M = 3.28084;
export const SFT_PER_SQM = 10.7639;

export type MeasurementType = "floor" | "wall_perimeter" | "wall_individual" | "direct";
export type LinearUnit = "ft" | "m";
export type AreaUnit = "sft" | "sqm";

export interface Deduction {
  label: string;
  count: number;
  width: number;
  height: number;
}

export interface WallSegment {
  length: number;
}

export interface AreaCalculatorInput {
  measurement_type: MeasurementType;
  /** ft or m for floor/wall; ignored for "direct" */
  input_unit?: LinearUnit;
  /** sft or sqm — only used for "direct" mode */
  area_unit?: AreaUnit;
  room_name?: string;

  // Floor mode
  floor_length?: number;
  floor_width?: number;

  // Wall modes
  wall_height?: number;
  walls?: WallSegment[]; // for wall_individual
  // For wall_perimeter we reuse floor_length & floor_width as room L×W

  // Deductions (in input_unit dims, only meaningful for wall modes)
  deductions?: Deduction[];

  // Direct area
  direct_area?: number;

  // Common
  per_box_sft: number;
  wastage_pct: number; // 0–25
}

export interface AreaCalculatorResult {
  gross_area_sft: number;
  deduction_area_sft: number;
  net_area_sft: number;
  final_area_sft: number;
  required_boxes: number;
  warnings: string[];
}

export const DEFAULT_WASTAGE_PCT = 10;
export const MAX_WASTAGE_PCT = 25;

/** Convert linear value to feet (returns same number if already ft). */
export function toFeet(value: number, unit: LinearUnit): number {
  if (!Number.isFinite(value)) return 0;
  return unit === "m" ? value * FT_PER_M : value;
}

/** Convert area value to sft. */
export function toSft(value: number, unit: AreaUnit): number {
  if (!Number.isFinite(value)) return 0;
  return unit === "sqm" ? value * SFT_PER_SQM : value;
}

/** Round area to 2 decimals. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Core calculation. All inputs are interpreted per the input_unit / area_unit on the payload.
 * Output is always in sft + integer boxes.
 */
export function calculateArea(input: AreaCalculatorInput): AreaCalculatorResult {
  const warnings: string[] = [];
  const wastagePct = clamp(Number(input.wastage_pct ?? DEFAULT_WASTAGE_PCT), 0, MAX_WASTAGE_PCT);
  const perBoxSft = Number(input.per_box_sft ?? 0);

  if (perBoxSft <= 0) {
    return {
      gross_area_sft: 0,
      deduction_area_sft: 0,
      net_area_sft: 0,
      final_area_sft: 0,
      required_boxes: 0,
      warnings: ["Product per_box_sft is missing or zero — cannot calculate boxes."],
    };
  }

  let grossSft = 0;
  let deductionSft = 0;

  if (input.measurement_type === "direct") {
    const areaUnit: AreaUnit = input.area_unit ?? "sft";
    grossSft = toSft(Number(input.direct_area ?? 0), areaUnit);
  } else {
    const unit: LinearUnit = input.input_unit ?? "ft";
    const lengthFt = toFeet(Number(input.floor_length ?? 0), unit);
    const widthFt = toFeet(Number(input.floor_width ?? 0), unit);
    const heightFt = toFeet(Number(input.wall_height ?? 0), unit);

    if (input.measurement_type === "floor") {
      grossSft = lengthFt * widthFt;
    } else if (input.measurement_type === "wall_perimeter") {
      grossSft = 2 * (lengthFt + widthFt) * heightFt;
    } else if (input.measurement_type === "wall_individual") {
      const walls = input.walls ?? [];
      grossSft = walls.reduce((s, w) => s + toFeet(Number(w.length || 0), unit) * heightFt, 0);
    }

    // Deductions only apply to wall modes (door/window cutouts)
    if (input.measurement_type !== "floor") {
      const deds = input.deductions ?? [];
      deductionSft = deds.reduce((s, d) => {
        const wFt = toFeet(Number(d.width || 0), unit);
        const hFt = toFeet(Number(d.height || 0), unit);
        const cnt = Math.max(0, Math.floor(Number(d.count || 0)));
        return s + cnt * wFt * hFt;
      }, 0);
    }
  }

  if (grossSft <= 0) {
    warnings.push("Gross area is zero — check dimensions.");
  }

  if (deductionSft > grossSft && grossSft > 0) {
    warnings.push("Deductions exceed gross area — capped to zero net area.");
    deductionSft = grossSft;
  }

  const netSft = Math.max(0, grossSft - deductionSft);
  const finalSft = netSft * (1 + wastagePct / 100);
  const requiredBoxes = finalSft > 0 ? Math.max(1, Math.ceil(finalSft / perBoxSft)) : 0;

  return {
    gross_area_sft: r2(grossSft),
    deduction_area_sft: r2(deductionSft),
    net_area_sft: r2(netSft),
    final_area_sft: r2(finalSft),
    required_boxes: requiredBoxes,
    warnings,
  };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Snapshot shape persisted on quotation_items.measurement_snapshot */
export interface MeasurementSnapshot {
  measurement_type: MeasurementType;
  room_name: string | null;
  input_unit: LinearUnit | null;
  area_unit: AreaUnit | null;
  floor_length: number | null;
  floor_width: number | null;
  wall_height: number | null;
  walls: WallSegment[] | null;
  deductions: Deduction[] | null;
  direct_area: number | null;
  gross_area_sft: number;
  deduction_area_sft: number;
  net_area_sft: number;
  wastage_pct: number;
  final_area_sft: number;
  per_box_sft_snapshot: number;
  calculated_boxes: number;
  final_boxes: number;
  manual_override: boolean;
  override_reason: string | null;
  notes: string | null;
}

export function buildSnapshot(
  input: AreaCalculatorInput,
  result: AreaCalculatorResult,
  finalBoxes: number,
  manualOverride: boolean,
  overrideReason: string | null,
  notes: string | null,
): MeasurementSnapshot {
  return {
    measurement_type: input.measurement_type,
    room_name: input.room_name?.trim() || null,
    input_unit: input.measurement_type === "direct" ? null : (input.input_unit ?? "ft"),
    area_unit: input.measurement_type === "direct" ? (input.area_unit ?? "sft") : null,
    floor_length: input.measurement_type === "direct" ? null : Number(input.floor_length ?? 0) || null,
    floor_width: input.measurement_type === "direct" ? null : Number(input.floor_width ?? 0) || null,
    wall_height: input.measurement_type === "floor" || input.measurement_type === "direct" ? null : Number(input.wall_height ?? 0) || null,
    walls: input.measurement_type === "wall_individual" ? (input.walls ?? []) : null,
    deductions: input.measurement_type === "floor" || input.measurement_type === "direct" ? null : (input.deductions ?? []),
    direct_area: input.measurement_type === "direct" ? Number(input.direct_area ?? 0) || null : null,
    gross_area_sft: result.gross_area_sft,
    deduction_area_sft: result.deduction_area_sft,
    net_area_sft: result.net_area_sft,
    wastage_pct: input.wastage_pct,
    final_area_sft: result.final_area_sft,
    per_box_sft_snapshot: input.per_box_sft,
    calculated_boxes: result.required_boxes,
    final_boxes: finalBoxes,
    manual_override: manualOverride,
    override_reason: manualOverride ? (overrideReason?.trim() || null) : null,
    notes: notes?.trim() || null,
  };
}
