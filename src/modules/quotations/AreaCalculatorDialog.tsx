import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Calculator } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";

import { useDealerId } from "@/hooks/useDealerId";
import { productService } from "@/services/productService";
import {
  calculateArea,
  buildSnapshot,
  DEFAULT_WASTAGE_PCT,
  type AreaCalculatorInput,
  type Deduction,
  type LinearUnit,
  type AreaUnit,
  type MeasurementType,
  type WallSegment,
  type MeasurementSnapshot,
} from "@/lib/areaCalculator";

export interface AreaCalculatorInsertPayload {
  product: {
    id: string;
    name: string;
    sku: string;
    per_box_sft: number;
    default_sale_rate: number;
  };
  final_boxes: number;
  snapshot: MeasurementSnapshot;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onInsert: (payload: AreaCalculatorInsertPayload) => void;
}

const AreaCalculatorDialog = ({ open, onOpenChange, onInsert }: Props) => {
  const dealerId = useDealerId();

  const { data: productsResp } = useQuery({
    queryKey: ["products-area-calc", dealerId],
    queryFn: () => productService.list(dealerId, "", 1),
    enabled: open,
  });

  // Tiles only: box_sft unit + per_box_sft > 0 + active
  const tileProducts = useMemo(
    () =>
      (productsResp?.data ?? []).filter(
        (p) => p.active && p.unit_type === "box_sft" && Number(p.per_box_sft ?? 0) > 0,
      ),
    [productsResp],
  );

  const [productId, setProductId] = useState<string>("");
  const [roomName, setRoomName] = useState("");
  const [measurementType, setMeasurementType] = useState<MeasurementType>("floor");
  const [inputUnit, setInputUnit] = useState<LinearUnit>("ft");
  const [areaUnit, setAreaUnit] = useState<AreaUnit>("sft");

  const [floorLength, setFloorLength] = useState<string>("");
  const [floorWidth, setFloorWidth] = useState<string>("");
  const [wallHeight, setWallHeight] = useState<string>("");
  const [walls, setWalls] = useState<WallSegment[]>([{ length: 0 }]);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [directArea, setDirectArea] = useState<string>("");
  const [wastagePct, setWastagePct] = useState<number>(DEFAULT_WASTAGE_PCT);
  const [notes, setNotes] = useState<string>("");

  const [manualOverride, setManualOverride] = useState(false);
  const [overrideBoxes, setOverrideBoxes] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");

  const product = tileProducts.find((p) => p.id === productId);
  const perBoxSft = Number(product?.per_box_sft ?? 0);

  const calcInput: AreaCalculatorInput = {
    measurement_type: measurementType,
    input_unit: inputUnit,
    area_unit: areaUnit,
    room_name: roomName,
    floor_length: Number(floorLength || 0),
    floor_width: Number(floorWidth || 0),
    wall_height: Number(wallHeight || 0),
    walls,
    deductions,
    direct_area: Number(directArea || 0),
    per_box_sft: perBoxSft,
    wastage_pct: wastagePct,
  };

  const result = calculateArea(calcInput);
  const finalBoxes = manualOverride
    ? Math.max(0, Math.floor(Number(overrideBoxes || 0)))
    : result.required_boxes;

  const canInsert = !!product && finalBoxes > 0 && (!manualOverride || (overrideBoxes !== "" && overrideReason.trim().length > 0));

  const reset = () => {
    setProductId("");
    setRoomName("");
    setMeasurementType("floor");
    setInputUnit("ft");
    setAreaUnit("sft");
    setFloorLength("");
    setFloorWidth("");
    setWallHeight("");
    setWalls([{ length: 0 }]);
    setDeductions([]);
    setDirectArea("");
    setWastagePct(DEFAULT_WASTAGE_PCT);
    setNotes("");
    setManualOverride(false);
    setOverrideBoxes("");
    setOverrideReason("");
  };

  const handleInsert = () => {
    if (!product || !canInsert) return;
    const snapshot = buildSnapshot(
      calcInput,
      result,
      finalBoxes,
      manualOverride,
      manualOverride ? overrideReason : null,
      notes,
    );
    onInsert({
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        per_box_sft: perBoxSft,
        default_sale_rate: Number(product.default_sale_rate ?? 0),
      },
      final_boxes: finalBoxes,
      snapshot,
    });
    reset();
    onOpenChange(false);
  };

  const linearLabel = inputUnit === "ft" ? "ft" : "m";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Area Calculator
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4">
          {/* LEFT: Inputs */}
          <div className="space-y-4">
            <div>
              <Label>Tile Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a tile product…" />
                </SelectTrigger>
                <SelectContent>
                  {tileProducts.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No tile products with per-box-sft configured.
                    </div>
                  ) : (
                    tileProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku}) · {Number(p.per_box_sft).toFixed(2)} sft/box
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Sanitary &amp; piece-unit products are excluded.</p>
            </div>

            <div>
              <Label>Room Name</Label>
              <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="e.g. Master Bedroom" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Measurement Type</Label>
                <Select value={measurementType} onValueChange={(v) => setMeasurementType(v as MeasurementType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="floor">Floor (L × W)</SelectItem>
                    <SelectItem value="wall_perimeter">Wall — Perimeter</SelectItem>
                    <SelectItem value="wall_individual">Wall — Individual walls</SelectItem>
                    <SelectItem value="direct">Direct Area</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unit</Label>
                {measurementType === "direct" ? (
                  <RadioGroup value={areaUnit} onValueChange={(v) => setAreaUnit(v as AreaUnit)} className="flex gap-3 pt-2">
                    <div className="flex items-center gap-1"><RadioGroupItem value="sft" id="u-sft" /><Label htmlFor="u-sft" className="text-sm font-normal">sft</Label></div>
                    <div className="flex items-center gap-1"><RadioGroupItem value="sqm" id="u-sqm" /><Label htmlFor="u-sqm" className="text-sm font-normal">sqm</Label></div>
                  </RadioGroup>
                ) : (
                  <RadioGroup value={inputUnit} onValueChange={(v) => setInputUnit(v as LinearUnit)} className="flex gap-3 pt-2">
                    <div className="flex items-center gap-1"><RadioGroupItem value="ft" id="u-ft" /><Label htmlFor="u-ft" className="text-sm font-normal">ft</Label></div>
                    <div className="flex items-center gap-1"><RadioGroupItem value="m" id="u-m" /><Label htmlFor="u-m" className="text-sm font-normal">m</Label></div>
                  </RadioGroup>
                )}
              </div>
            </div>

            {/* Floor or wall_perimeter need L×W */}
            {(measurementType === "floor" || measurementType === "wall_perimeter") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Length ({linearLabel})</Label>
                  <Input type="number" step="0.01" value={floorLength} onChange={(e) => setFloorLength(e.target.value)} />
                </div>
                <div>
                  <Label>Width ({linearLabel})</Label>
                  <Input type="number" step="0.01" value={floorWidth} onChange={(e) => setFloorWidth(e.target.value)} />
                </div>
              </div>
            )}

            {/* Wall modes need height */}
            {(measurementType === "wall_perimeter" || measurementType === "wall_individual") && (
              <div>
                <Label>Wall Height ({linearLabel})</Label>
                <Input type="number" step="0.01" value={wallHeight} onChange={(e) => setWallHeight(e.target.value)} />
              </div>
            )}

            {/* Individual walls list */}
            {measurementType === "wall_individual" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Walls</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => setWalls([...walls, { length: 0 }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add wall
                  </Button>
                </div>
                {walls.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Wall {i + 1}</span>
                    <Input
                      type="number" step="0.01"
                      value={w.length}
                      onChange={(e) => {
                        const next = [...walls];
                        next[i] = { length: Number(e.target.value || 0) };
                        setWalls(next);
                      }}
                      placeholder={`Length (${linearLabel})`}
                    />
                    <Button type="button" size="icon" variant="ghost" onClick={() => setWalls(walls.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Direct area */}
            {measurementType === "direct" && (
              <div>
                <Label>Direct Area ({areaUnit})</Label>
                <Input type="number" step="0.01" value={directArea} onChange={(e) => setDirectArea(e.target.value)} />
              </div>
            )}

            {/* Deductions only for wall modes */}
            {(measurementType === "wall_perimeter" || measurementType === "wall_individual") && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Deductions (Doors / Windows)</Label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => setDeductions([...deductions, { label: "Door", count: 1, width: 3, height: 7 }])}>
                      <Plus className="h-3 w-3 mr-1" /> Door
                    </Button>
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => setDeductions([...deductions, { label: "Window", count: 1, width: 4, height: 3 }])}>
                      <Plus className="h-3 w-3 mr-1" /> Window
                    </Button>
                  </div>
                </div>
                {deductions.map((d, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 items-center">
                    <Input className="col-span-3" value={d.label} onChange={(e) => updateDed(i, { label: e.target.value })} />
                    <Input className="col-span-2" type="number" step="1" value={d.count} onChange={(e) => updateDed(i, { count: Number(e.target.value || 0) })} placeholder="Qty" />
                    <Input className="col-span-3" type="number" step="0.01" value={d.width} onChange={(e) => updateDed(i, { width: Number(e.target.value || 0) })} placeholder={`W (${linearLabel})`} />
                    <Input className="col-span-3" type="number" step="0.01" value={d.height} onChange={(e) => updateDed(i, { height: Number(e.target.value || 0) })} placeholder={`H (${linearLabel})`} />
                    <Button type="button" size="icon" variant="ghost" className="col-span-1" onClick={() => setDeductions(deductions.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <Label>Wastage % (0–25)</Label>
              <Input type="number" step="1" min={0} max={25}
                value={wastagePct}
                onChange={(e) => setWastagePct(Math.max(0, Math.min(25, Number(e.target.value || 0))))}
              />
            </div>

            <div>
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Customer wants extras for repairs" />
            </div>
          </div>

          {/* RIGHT: Live preview */}
          <div className="space-y-3">
            <Card className="bg-muted/30">
              <CardContent className="py-4 space-y-2 text-sm">
                <p className="text-xs uppercase font-semibold text-muted-foreground">Live Preview</p>
                <Row label="Gross area" value={`${result.gross_area_sft.toFixed(2)} sft`} />
                <Row label="Deduction" value={`${result.deduction_area_sft.toFixed(2)} sft`} />
                <Row label="Net area" value={`${result.net_area_sft.toFixed(2)} sft`} />
                <Row label={`+ Wastage ${wastagePct}%`} value={`${result.final_area_sft.toFixed(2)} sft`} />
                <Separator />
                <Row label="Per box" value={`${perBoxSft.toFixed(2)} sft`} />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Calculated boxes</span>
                  <span className="text-base font-bold text-primary">{result.required_boxes}</span>
                </div>
                {result.warnings.length > 0 && (
                  <div className="text-xs text-destructive space-y-1 pt-1">
                    {result.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-3 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={manualOverride} onChange={(e) => setManualOverride(e.target.checked)} />
                  <span>Manual override final boxes</span>
                </label>
                {manualOverride && (
                  <div className="space-y-2">
                    <div>
                      <Label>Final Boxes</Label>
                      <Input type="number" step="1" min={0} value={overrideBoxes} onChange={(e) => setOverrideBoxes(e.target.value)} />
                    </div>
                    <div>
                      <Label>Override Reason</Label>
                      <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="e.g. Customer asked round number" />
                    </div>
                  </div>
                )}
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Final boxes to insert</span>
                  <span className="text-lg font-bold">{finalBoxes}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleInsert} disabled={!canInsert}>
            Insert into Quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function updateDed(i: number, patch: Partial<Deduction>) {
    const next = [...deductions];
    next[i] = { ...next[i], ...patch };
    setDeductions(next);
  }
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
);

export default AreaCalculatorDialog;
