import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  demandPlanningSettingsService,
  DEMAND_PLANNING_DEFAULTS,
  DEMAND_PLANNING_LIMITS,
  type DemandPlanningSettings,
} from "@/services/demandPlanningSettingsService";
import { useDealerId } from "@/hooks/useDealerId";

type EditableKeys = keyof Omit<DemandPlanningSettings, "dealer_id">;

interface FieldDef {
  key: EditableKeys;
  label: string;
  hint: string;
}

const FIELDS: FieldDef[] = [
  { key: "velocity_window_days", label: "Velocity window (days)", hint: "Sales window used to calculate velocity (e.g. 30 / 60 / 90)." },
  { key: "stockout_cover_days", label: "Stockout cover (days)", hint: "Cover days below which a product is flagged as Stockout Risk." },
  { key: "reorder_cover_days", label: "Reorder cover (days)", hint: "Cover days below which a product is flagged as Reorder Needed." },
  { key: "target_cover_days", label: "Target cover (days)", hint: "Used to size the suggested reorder quantity." },
  { key: "incoming_window_days", label: "Incoming lookahead (days)", hint: "Recent purchase window counted as Incoming inflow." },
  { key: "safety_stock_days", label: "Safety stock (days)", hint: "Optional cushion = velocity × this many days. 0 disables." },
  { key: "fast_moving_30d_qty", label: "Fast-moving threshold (units in 30d)", hint: "Sold this many or more in 30 days = Fast Moving." },
  { key: "slow_moving_30d_max", label: "Slow-moving threshold (units in 30d)", hint: "Sold something in 90d but fewer than this in 30d = Slow Moving." },
  { key: "dead_stock_days", label: "Dead stock idle (days)", hint: "No sales for this many days while stock on hand = Dead Stock." },
];

export function DemandPlanningSettingsCard() {
  const dealerId = useDealerId();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["demand-planning-settings", dealerId],
    queryFn: () => demandPlanningSettingsService.get(dealerId),
    enabled: !!dealerId,
  });

  const [form, setForm] = useState<Record<EditableKeys, string>>({
    ...Object.fromEntries(
      Object.keys(DEMAND_PLANNING_DEFAULTS).map((k) => [
        k,
        String(DEMAND_PLANNING_DEFAULTS[k as EditableKeys]),
      ]),
    ) as Record<EditableKeys, string>,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      velocity_window_days: String(data.velocity_window_days),
      stockout_cover_days: String(data.stockout_cover_days),
      reorder_cover_days: String(data.reorder_cover_days),
      target_cover_days: String(data.target_cover_days),
      fast_moving_30d_qty: String(data.fast_moving_30d_qty),
      slow_moving_30d_max: String(data.slow_moving_30d_max),
      dead_stock_days: String(data.dead_stock_days),
      incoming_window_days: String(data.incoming_window_days),
      safety_stock_days: String(data.safety_stock_days),
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, Number(v)]),
      ) as Omit<DemandPlanningSettings, "dealer_id">;
      return demandPlanningSettingsService.upsert(dealerId, payload);
    },
    onSuccess: () => {
      toast.success("Demand planning settings saved");
      qc.invalidateQueries({ queryKey: ["demand-planning-settings"] });
      qc.invalidateQueries({ queryKey: ["demand-planning-rows"] });
      qc.invalidateQueries({ queryKey: ["demand-planning-dashboard"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const reset = useMutation({
    mutationFn: () => demandPlanningSettingsService.reset(dealerId),
    onSuccess: () => {
      toast.success("Reset to defaults");
      qc.invalidateQueries({ queryKey: ["demand-planning-settings"] });
      qc.invalidateQueries({ queryKey: ["demand-planning-rows"] });
      qc.invalidateQueries({ queryKey: ["demand-planning-dashboard"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Demand Planning Thresholds
        </CardTitle>
        <CardDescription>
          Tune how Reorder Suggestion, Low Stock, Stockout Risk, Dead Stock and Slow/Fast Moving
          are calculated. Settings are advisory — they only change report classification, never
          stock or ledger.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FIELDS.map((f) => {
                const limits = DEMAND_PLANNING_LIMITS[f.key];
                return (
                  <div key={f.key} className="space-y-1">
                    <Label htmlFor={`dp-${f.key}`} className="text-sm font-medium">
                      {f.label}
                    </Label>
                    <Input
                      id={`dp-${f.key}`}
                      type="number"
                      min={limits.min}
                      max={limits.max}
                      step={1}
                      value={form[f.key]}
                      onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {f.hint} <span className="opacity-70">({limits.min}–{limits.max})</span>
                    </p>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                Save Thresholds
              </Button>
              <Button
                variant="outline"
                onClick={() => reset.mutate()}
                disabled={reset.isPending}
              >
                Reset to Defaults
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Changes apply to new report queries immediately after refresh.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
