import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useDealerId } from "@/hooks/useDealerId";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings, AlertTriangle, Package, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";

const SettingsPage = () => {
  const { isDealerAdmin } = usePermissions();
  const dealerId = useDealerId();
  const queryClient = useQueryClient();

  const { data: dealer, isLoading } = useQuery({
    queryKey: ["dealer-settings", dealerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dealers")
        .select("id, name, allow_backorder")
        .eq("id", dealerId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!dealerId,
  });

  const toggleBackorder = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("dealers")
        .update({ allow_backorder: enabled } as any)
        .eq("id", dealerId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["dealer-settings"] });
      toast.success(enabled ? "Backorder mode enabled" : "Backorder mode disabled");
    },
    onError: (e) => toast.error(e.message),
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
              {/* Allow Sale Below Stock */}
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
                  checked={(dealer as any)?.allow_backorder === true}
                  onCheckedChange={(checked) => toggleBackorder.mutate(checked)}
                  disabled={toggleBackorder.isPending}
                />
              </div>

              {(dealer as any)?.allow_backorder && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Backorder Mode is Active</span>
                  </div>
                  <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc pl-5">
                    <li>Sales can be created for quantities above current stock</li>
                    <li>Shortage quantities are tracked as "Backordered"</li>
                    <li>New purchases auto-allocate to oldest pending backorders (FIFO)</li>
                    <li>Partial deliveries are supported for backorder sales</li>
                    <li>All backorder activity is logged in audit trail</li>
                  </ul>
                </div>
              )}

              <Separator />

              {/* Mode explanation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`rounded-md border p-4 ${!(dealer as any)?.allow_backorder ? "border-primary bg-primary/5" : "border-border"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Strict Stock Mode</span>
                    {!(dealer as any)?.allow_backorder && (
                      <Badge variant="default" className="text-[10px]">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sales are blocked when requested quantity exceeds available stock.
                    This is the safest mode for preventing stock discrepancies.
                  </p>
                </div>
                <div className={`rounded-md border p-4 ${(dealer as any)?.allow_backorder ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/10" : "border-border"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-semibold">Backorder Mode</span>
                    {(dealer as any)?.allow_backorder && (
                      <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">Active</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Allows billing even when stock is insufficient. Ideal for tile dealers
                    who take orders before stock arrives from the company.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default SettingsPage;
