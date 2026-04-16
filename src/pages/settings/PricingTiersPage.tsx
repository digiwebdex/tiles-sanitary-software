import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2, Search, Tags, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useDealerId } from "@/hooks/useDealerId";
import { usePermissions } from "@/hooks/usePermissions";
import { pricingTierService, type PriceTier } from "@/services/pricingTierService";
import { productService } from "@/services/productService";
import { formatCurrency } from "@/lib/utils";

const PricingTiersPage = () => {
  const dealerId = useDealerId();
  const navigate = useNavigate();
  const { isDealerAdmin } = usePermissions();
  const qc = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PriceTier | null>(null);
  const [tierName, setTierName] = useState("");
  const [tierDesc, setTierDesc] = useState("");
  const [tierStatus, setTierStatus] = useState<"active" | "inactive">("active");

  const [matrixTierId, setMatrixTierId] = useState<string>("");
  const [matrixSearch, setMatrixSearch] = useState("");
  const [draftRates, setDraftRates] = useState<Record<string, string>>({});

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tiers = [], isLoading: tiersLoading } = useQuery({
    queryKey: ["price-tiers", dealerId],
    queryFn: () => pricingTierService.listTiers(dealerId),
    enabled: !!dealerId,
  });

  const { data: productsResp } = useQuery({
    queryKey: ["price-tier-products", dealerId],
    queryFn: () => productService.list(dealerId, "", 1),
    enabled: !!dealerId,
  });
  const products = useMemo(
    () => (productsResp?.data ?? []).filter((p) => p.active),
    [productsResp],
  );

  const { data: tierItems = [] } = useQuery({
    queryKey: ["price-tier-items", matrixTierId],
    queryFn: () => pricingTierService.listTierItems(matrixTierId),
    enabled: !!matrixTierId,
  });
  const tierRateMap = useMemo(
    () => new Map(tierItems.map((it) => [it.product_id, Number(it.rate)])),
    [tierItems],
  );

  const filteredProducts = useMemo(() => {
    const q = matrixSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [products, matrixSearch]);

  const openNewTier = () => {
    setEditing(null);
    setTierName("");
    setTierDesc("");
    setTierStatus("active");
    setEditorOpen(true);
  };

  const openEditTier = (t: PriceTier) => {
    setEditing(t);
    setTierName(t.name);
    setTierDesc(t.description ?? "");
    setTierStatus(t.status);
    setEditorOpen(true);
  };

  const saveTier = useMutation({
    mutationFn: async () => {
      if (!tierName.trim()) throw new Error("Tier name is required");
      if (editing) {
        await pricingTierService.updateTier(editing.id, {
          name: tierName,
          description: tierDesc,
          status: tierStatus,
        });
      } else {
        await pricingTierService.createTier(dealerId, {
          name: tierName,
          description: tierDesc,
          status: tierStatus,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-tiers"] });
      toast.success(editing ? "Tier updated" : "Tier created");
      setEditorOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTier = useMutation({
    mutationFn: async (id: string) => pricingTierService.deleteTier(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-tiers"] });
      qc.invalidateQueries({ queryKey: ["price-tier-items"] });
      if (matrixTierId === deleteId) setMatrixTierId("");
      setDeleteId(null);
      toast.success("Tier deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRate = useMutation({
    mutationFn: async ({ productId, rate }: { productId: string; rate: number | null }) => {
      await pricingTierService.setTierRate(dealerId, matrixTierId, productId, rate);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-tier-items", matrixTierId] });
      toast.success("Rate saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isDealerAdmin) {
    return (
      <div className="container mx-auto max-w-4xl p-6">
        <p className="text-destructive">Access denied. Dealer admin only.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <Tags className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Pricing Tiers</h1>
        </div>
        <Button onClick={openNewTier}>
          <Plus className="mr-1 h-4 w-4" /> New Tier
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tiers</CardTitle>
          <CardDescription>
            Create named price levels (e.g. Retail, Wholesale, Contractor, Project) and assign per-product rates below.
            Customers linked to a tier will get its rates auto-filled in quotations and sales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tiersLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : tiers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No tiers yet. Click "New Tier" to add one.
            </p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-2">Name</th>
                    <th className="py-2 px-2">Description</th>
                    <th className="py-2 px-2 w-24">Status</th>
                    <th className="py-2 pl-2 w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map((t) => (
                    <tr key={t.id} className="border-b">
                      <td className="py-2 pr-2 font-medium">{t.name}</td>
                      <td className="py-2 px-2 text-muted-foreground">{t.description ?? "—"}</td>
                      <td className="py-2 px-2">
                        <Badge variant={t.status === "active" ? "default" : "secondary"}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditTier(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(t.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Rate Matrix</CardTitle>
          <CardDescription>
            Pick a tier to override rates per product. Leave a row blank to fall back to the product's default sale rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={matrixTierId} onValueChange={setMatrixTierId}>
              <SelectTrigger className="sm:w-72">
                <SelectValue placeholder="Select a tier…" />
              </SelectTrigger>
              <SelectContent>
                {tiers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.status === "inactive" && "(inactive)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search product by name or SKU…"
                value={matrixSearch}
                onChange={(e) => setMatrixSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {!matrixTierId ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Select a tier to view and edit rates.
            </p>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead className="border-b sticky top-0 bg-card">
                  <tr className="text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-2">Product</th>
                    <th className="py-2 px-2 w-32 text-right">Default Rate</th>
                    <th className="py-2 px-2 w-40 text-right">Tier Rate</th>
                    <th className="py-2 pl-2 w-24 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => {
                    const existing = tierRateMap.get(p.id);
                    const draftKey = p.id;
                    const draftValue = draftRates[draftKey];
                    const inputValue = draftValue ?? (existing != null ? String(existing) : "");
                    const dirty = draftValue !== undefined && draftValue !== (existing != null ? String(existing) : "");
                    return (
                      <tr key={p.id} className="border-b">
                        <td className="py-2 pr-2">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{p.sku}</div>
                        </td>
                        <td className="py-2 px-2 text-right">{formatCurrency(p.default_sale_rate)}</td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={inputValue}
                            placeholder="—"
                            onChange={(e) =>
                              setDraftRates((d) => ({ ...d, [draftKey]: e.target.value }))
                            }
                            className="text-right h-8"
                          />
                        </td>
                        <td className="py-2 pl-2 text-right">
                          {dirty ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={setRate.isPending}
                              onClick={() => {
                                const v = inputValue.trim();
                                const rate = v === "" ? null : Number(v);
                                if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
                                  toast.error("Invalid rate");
                                  return;
                                }
                                setRate.mutate(
                                  { productId: p.id, rate },
                                  { onSuccess: () => setDraftRates((d) => { const n = { ...d }; delete n[draftKey]; return n; }) },
                                );
                              }}
                            >
                              <Save className="h-3.5 w-3.5 mr-1" /> Save
                            </Button>
                          ) : existing != null ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setRate.mutate({ productId: p.id, rate: null })}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No matching products.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tier" : "New Pricing Tier"}</DialogTitle>
            <DialogDescription>
              Tier names are unique per dealer. Use the matrix below to set per-product rates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={tierName} onChange={(e) => setTierName(e.target.value)} placeholder="e.g. Wholesale" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={tierDesc}
                onChange={(e) => setTierDesc(e.target.value)}
                placeholder="Who this tier applies to (optional)"
                rows={2}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={tierStatus} onValueChange={(v) => setTierStatus(v as "active" | "inactive")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={() => saveTier.mutate()} disabled={saveTier.isPending}>
              {saveTier.isPending ? "Saving…" : editing ? "Update Tier" : "Create Tier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tier?</AlertDialogTitle>
            <AlertDialogDescription>
              All per-product rates for this tier will be removed. Customers currently assigned to it
              will fall back to the product default rate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteTier.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PricingTiersPage;
