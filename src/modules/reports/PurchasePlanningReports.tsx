import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Package, Users, ArrowRight, Folder, ShoppingCart, Plus } from "lucide-react";
import { purchasePlanningService } from "@/services/purchasePlanningService";
import { usePermissions } from "@/hooks/usePermissions";
import {
  CreatePurchaseDraftDialog,
  ShortageStatusBadge,
} from "@/components/CreatePurchaseDraftDialog";

interface ReportProps {
  dealerId: string;
}

/** Purchase Need by Product — primary planning view */
export function PurchaseNeedByProductReport({ dealerId }: ReportProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedSaleItemIds, setSelectedSaleItemIds] = useState<Set<string>>(new Set());
  const [draftOpen, setDraftOpen] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["purchase-planning-products", dealerId],
    queryFn: () => purchasePlanningService.productShortages(dealerId),
    enabled: !!dealerId,
  });

  const { data: drillRows } = useQuery({
    queryKey: ["purchase-planning-customers", dealerId, selectedProductId],
    queryFn: () => purchasePlanningService.customerShortages(dealerId, selectedProductId!),
    enabled: !!dealerId && !!selectedProductId,
  });

  // Pre-load full customer rows so the "Plan Selected" action works for any selection,
  // even before the user expanded a product detail panel.
  const { data: allCustomerRows = [] } = useQuery({
    queryKey: ["purchase-planning-all", dealerId],
    queryFn: () => purchasePlanningService.customerShortages(dealerId),
    enabled: !!dealerId,
  });

  const totalShortage = (products ?? []).reduce((s, p) => s + p.shortage_qty, 0);
  const totalSuggested = (products ?? []).reduce((s, p) => s + p.suggested_purchase_qty, 0);

  const selectedRows = useMemo(
    () => allCustomerRows.filter((r) => selectedSaleItemIds.has(r.sale_item_id)),
    [allCustomerRows, selectedSaleItemIds],
  );

  const toggle = (id: string) => {
    setSelectedSaleItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onCreated = (purchaseId: string) => {
    setSelectedSaleItemIds(new Set());
    queryClient.invalidateQueries({ queryKey: ["purchase-planning-products", dealerId] });
    queryClient.invalidateQueries({ queryKey: ["purchase-planning-customers", dealerId] });
    queryClient.invalidateQueries({ queryKey: ["purchase-planning-all", dealerId] });
    queryClient.invalidateQueries({ queryKey: ["purchase-planning-dashboard", dealerId] });
    queryClient.invalidateQueries({ queryKey: ["purchases"] });
    queryClient.invalidateQueries({ queryKey: ["stock"] });
    navigate(`/purchases/${purchaseId}`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <SummaryTile label="Products Short" value={String(products?.length ?? 0)} icon={Package} />
        <SummaryTile label="Total Shortage Qty" value={String(totalShortage)} icon={ArrowRight} accent="warning" />
        <SummaryTile label="Suggested Purchase" value={String(totalSuggested)} icon={Package} accent="primary" />
        <SummaryTile label="Pending Lines" value={String((products ?? []).reduce((s, p) => s + p.pending_lines, 0))} icon={Users} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Purchase Need by Product</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Live shortage = customer backorder demand minus stock already allocated.
              Click a product to expand the customers waiting, then tick rows to plan a purchase.
            </p>
          </div>
          {permissions.canEditPrices && (
            <Button
              size="sm"
              onClick={() => setDraftOpen(true)}
              disabled={selectedSaleItemIds.size === 0}
            >
              <ShoppingCart className="h-4 w-4 mr-1.5" />
              Create Purchase ({selectedSaleItemIds.size})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-center">Shortage</TableHead>
                    <TableHead className="text-center">Open</TableHead>
                    <TableHead className="text-center">Planned</TableHead>
                    <TableHead className="text-center">Suggested</TableHead>
                    <TableHead className="text-center">Customers</TableHead>
                    <TableHead className="text-center">Oldest</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(products ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No purchase need detected
                      </TableCell>
                    </TableRow>
                  ) : (products ?? []).map((p) => {
                    const isSel = selectedProductId === p.product_id;
                    return (
                      <>
                        <TableRow
                          key={p.product_id}
                          className={isSel ? "bg-muted/50" : "cursor-pointer hover:bg-muted/30"}
                          onClick={() => setSelectedProductId(isSel ? null : p.product_id)}
                        >
                          <TableCell>
                            <span className="font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground ml-1">({p.sku})</span>
                          </TableCell>
                          <TableCell>{p.brand}</TableCell>
                          <TableCell>{p.unit_type === "box_sft" ? "Box" : "Piece"}</TableCell>
                          <TableCell className="text-center font-semibold text-amber-600">{p.shortage_qty}</TableCell>
                          <TableCell className="text-center">{p.open_qty}</TableCell>
                          <TableCell className="text-center text-blue-600">{p.planned_qty}</TableCell>
                          <TableCell className="text-center font-bold text-primary">{p.suggested_purchase_qty}</TableCell>
                          <TableCell className="text-center">{p.pending_customers}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {p.oldest_demand_date ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProductId(isSel ? null : p.product_id);
                              }}
                            >
                              {isSel ? "Hide" : "View"}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isSel && (
                          <TableRow key={`${p.product_id}-detail`}>
                            <TableCell colSpan={10} className="bg-muted/20 p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                                Customers waiting (oldest first) — tick to include in purchase plan
                              </p>
                              {(!drillRows || drillRows.length === 0) ? (
                                <p className="text-xs text-muted-foreground">No detail rows.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {drillRows.map((r) => (
                                    <div
                                      key={r.sale_item_id}
                                      className="flex items-center gap-3 text-sm p-2 rounded bg-card border"
                                    >
                                      {permissions.canEditPrices && (
                                        <Checkbox
                                          checked={selectedSaleItemIds.has(r.sale_item_id)}
                                          onCheckedChange={() => toggle(r.sale_item_id)}
                                        />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <span className="font-medium">{r.customer_name}</span>
                                        <span className="text-muted-foreground text-xs ml-2">
                                          {r.invoice_number ?? "—"} • {r.sale_date}
                                        </span>
                                        {r.project_name && (
                                          <Badge variant="outline" className="ml-2 text-xs">
                                            <Folder className="h-3 w-3 mr-1" />
                                            {r.project_name}{r.site_name ? ` › ${r.site_name}` : ""}
                                          </Badge>
                                        )}
                                        {(r.preferred_shade_code || r.preferred_caliber) && (
                                          <Badge variant="outline" className="ml-2 text-xs bg-orange-500/10 text-orange-700 border-orange-300">
                                            {[r.preferred_shade_code, r.preferred_caliber].filter(Boolean).join(" / ")}
                                          </Badge>
                                        )}
                                      </div>
                                      <ShortageStatusBadge status={r.status} />
                                      <Badge className="bg-amber-500/10 text-amber-700 border-amber-300">
                                        {r.shortage_qty} {r.unit_type === "box_sft" ? "box" : "pc"}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreatePurchaseDraftDialog
        open={draftOpen}
        onOpenChange={setDraftOpen}
        dealerId={dealerId}
        selectedRows={selectedRows}
        onCreated={onCreated}
      />
    </div>
  );
}

/** Customer / Site Demand Breakdown — flat list with status filter + selection */
export function CustomerSiteDemandReport({ dealerId }: ReportProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draftOpen, setDraftOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-planning-all-customers", dealerId],
    queryFn: () => purchasePlanningService.customerShortages(dealerId),
    enabled: !!dealerId,
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (statusFilter === "all") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [data, statusFilter]);

  const selectedRows = useMemo(
    () => (data ?? []).filter((r) => selected.has(r.sale_item_id)),
    [data, selected],
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onCreated = (purchaseId: string) => {
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["purchase-planning-all-customers", dealerId] });
    queryClient.invalidateQueries({ queryKey: ["purchase-planning-products", dealerId] });
    queryClient.invalidateQueries({ queryKey: ["purchase-planning-all", dealerId] });
    queryClient.invalidateQueries({ queryKey: ["purchase-planning-dashboard", dealerId] });
    queryClient.invalidateQueries({ queryKey: ["purchases"] });
    queryClient.invalidateQueries({ queryKey: ["stock"] });
    navigate(`/purchases/${purchaseId}`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Customer / Site Demand Breakdown</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Every open shortage line, ordered by oldest demand first. Use this to prioritise purchase planning by customer urgency.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="fulfilled">Fulfilled</SelectItem>
            </SelectContent>
          </Select>
          {permissions.canEditPrices && (
            <Button
              size="sm"
              onClick={() => setDraftOpen(true)}
              disabled={selected.size === 0}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Plan Purchase ({selected.size})
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {permissions.canEditPrices && <TableHead className="w-[40px]"></TableHead>}
                  <TableHead>Sale Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Project / Site</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Shade/Caliber</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No shortage demand for this filter
                    </TableCell>
                  </TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.sale_item_id}>
                    {permissions.canEditPrices && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(r.sale_item_id)}
                          onCheckedChange={() => toggle(r.sale_item_id)}
                          disabled={r.status === "fulfilled"}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground">{r.sale_date}</TableCell>
                    <TableCell className="font-mono text-sm">{r.invoice_number ?? "—"}</TableCell>
                    <TableCell className="font-medium">{r.customer_name}</TableCell>
                    <TableCell className="text-xs">
                      {r.project_name ? (
                        <span className="text-foreground">
                          {r.project_name}
                          {r.site_name && <span className="text-muted-foreground"> › {r.site_name}</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{r.product_name}</span>
                      <span className="text-xs text-muted-foreground ml-1">({r.product_sku})</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {(r.preferred_shade_code || r.preferred_caliber) ? (
                        <span className="text-orange-700">
                          {[r.preferred_shade_code, r.preferred_caliber].filter(Boolean).join(" / ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell><ShortageStatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-center font-semibold text-amber-600">
                      {r.shortage_qty} <span className="text-xs text-muted-foreground">{r.unit_type === "box_sft" ? "box" : "pc"}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CreatePurchaseDraftDialog
        open={draftOpen}
        onOpenChange={setDraftOpen}
        dealerId={dealerId}
        selectedRows={selectedRows}
        onCreated={onCreated}
      />
    </Card>
  );
}

/* — small local helper to avoid pulling another file — */
function SummaryTile({
  label, value, icon: Icon, accent = "default",
}: {
  label: string; value: string; icon: React.ElementType; accent?: "default" | "primary" | "warning";
}) {
  const accentClass =
    accent === "warning" ? "text-amber-600" : accent === "primary" ? "text-primary" : "text-foreground";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className={`text-lg font-bold ${accentClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
