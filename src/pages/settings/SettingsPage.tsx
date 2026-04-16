import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useDealerId } from "@/hooks/useDealerId";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings, AlertTriangle, Package, ShieldCheck, Calculator, Tags, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { ApprovalSettingsCard } from "@/components/approval/ApprovalSettingsCard";

const SettingsPage = () => {
  const { isDealerAdmin } = usePermissions();
  const dealerId = useDealerId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: dealer, isLoading } = useQuery({
    queryKey: ["dealer-settings", dealerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dealers")
        .select("id, name, allow_backorder, default_wastage_pct")
        .eq("id", dealerId)
        .single();
      if (error) throw new Error(error.message);
      return data as { id: string; name: string; allow_backorder: boolean; default_wastage_pct: number };
    },
    enabled: !!dealerId,
  });

  const [wastageInput, setWastageInput] = useState<string>("10");
  useEffect(() => {
    if (dealer?.default_wastage_pct != null) {
      setWastageInput(String(dealer.default_wastage_pct));
    }
  }, [dealer?.default_wastage_pct]);

  const toggleBackorder = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("dealers")
        .update({ allow_backorder: enabled } as never)
        .eq("id", dealerId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["dealer-settings"] });
      queryClient.invalidateQueries({ queryKey: ["dealer-info"] });
      toast.success(enabled ? "Backorder mode enabled" : "Backorder mode disabled");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveWastage = useMutation({
    mutationFn: async (pct: number) => {
      if (!Number.isFinite(pct) || pct < 0 || pct > 25) {
        throw new Error("Default wastage must be between 0 and 25");
      }
      const { error } = await supabase
        .from("dealers")
        .update({ default_wastage_pct: pct } as never)
        .eq("id", dealerId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealer-settings"] });
      queryClient.invalidateQueries({ queryKey: ["dealer-info"] });
      toast.success("Default wastage saved");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!isDealerAdmin) {
    return (
      <div className="container mx-auto max-w-4xl p-6">
        <p className="text-destructive">Access denied. Dealer admin only.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* Stock & Backorder Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Stock & Backorder Settings
              </CardTitle>
              <CardDescription>
                Control how the system handles sales when stock is insufficient.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="allow-backorder" className="text-sm font-medium">
                    Allow Sale Below Stock (Backorder Mode)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, salesmen can create invoices for quantities exceeding current stock.
                    The system will track shortages and auto-allocate when new stock arrives.
                  </p>
                </div>
                <Switch
                  id="allow-backorder"
                  checked={dealer?.allow_backorder === true}
                  onCheckedChange={(checked) => toggleBackorder.mutate(checked)}
                  disabled={toggleBackorder.isPending}
                />
              </div>

              {dealer?.allow_backorder && (
                <div className="rounded-md border border-warning/40 bg-warning-muted p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <span className="text-sm font-medium text-warning">Backorder Mode is Active</span>
                  </div>
                  <ul className="text-xs text-warning space-y-1 list-disc pl-5">
                    <li>Sales can be created for quantities above current stock</li>
                    <li>Shortage quantities are tracked as "Backordered"</li>
                    <li>New purchases auto-allocate to oldest pending backorders (FIFO)</li>
                    <li>Partial deliveries are supported for backorder sales</li>
                    <li>All backorder activity is logged in audit trail</li>
                  </ul>
                </div>
              )}

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`rounded-md border p-4 ${!dealer?.allow_backorder ? "border-primary bg-primary/5" : "border-border"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Strict Stock Mode</span>
                    {!dealer?.allow_backorder && (
                      <Badge variant="default" className="text-[10px]">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sales are blocked when requested quantity exceeds available stock.
                  </p>
                </div>
                <div className={`rounded-md border p-4 ${dealer?.allow_backorder ? "border-warning/40 bg-warning-muted" : "border-border"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-warning" />
                    <span className="text-sm font-semibold">Backorder Mode</span>
                    {dealer?.allow_backorder && (
                      <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Allows billing even when stock is insufficient.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Area Calculator Defaults */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Area Calculator Defaults
              </CardTitle>
              <CardDescription>
                Default wastage % used when a salesman opens the Area Calculator. They can still override per calculation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label htmlFor="default-wastage" className="text-sm font-medium">
                    Default Wastage % (0–25)
                  </Label>
                  <Input
                    id="default-wastage"
                    type="number"
                    min={0}
                    max={25}
                    step={1}
                    value={wastageInput}
                    onChange={(e) => setWastageInput(e.target.value)}
                    className="mt-1 max-w-[140px]"
                  />
                </div>
                <Button
                  onClick={() => saveWastage.mutate(Number(wastageInput))}
                  disabled={saveWastage.isPending}
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Industry standard for tile cuts is 10%. Salesman overrides are recorded in the measurement snapshot.
              </p>
            </CardContent>
          </Card>

          {/* Pricing Tiers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Tags className="h-4 w-4" />
                Pricing Tiers
              </CardTitle>
              <CardDescription>
                Define named price levels (Retail, Wholesale, Contractor, Project) and per-product rates.
                Customers linked to a tier get those rates auto-filled in quotations and sales.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate("/settings/pricing-tiers")}>
                Manage Pricing Tiers <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Approval Workflow */}
          <ApprovalSettingsCard />
        </>
      )}
    </div>
  );
};

export default SettingsPage;
