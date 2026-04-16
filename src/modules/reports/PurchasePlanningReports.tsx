import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Package, Users, Calendar, ArrowRight, Folder } from "lucide-react";
import { purchasePlanningService } from "@/services/purchasePlanningService";

interface ReportProps {
  dealerId: string;
}

/** Purchase Need by Product — primary planning view */
export function PurchaseNeedByProductReport({ dealerId }: ReportProps) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

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

  const totalShortage = (products ?? []).reduce((s, p) => s + p.shortage_qty, 0);
  const totalSuggested = (products ?? []).reduce((s, p) => s + p.suggested_purchase_qty, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <SummaryTile label="Products Short" value={String(products?.length ?? 0)} icon={Package} />
        <SummaryTile label="Total Shortage Qty" value={String(totalShortage)} icon={ArrowRight} accent="warning" />
        <SummaryTile label="Suggested Purchase" value={String(totalSuggested)} icon={Package} accent="primary" />
        <SummaryTile label="Pending Lines" value={String((products ?? []).reduce((s, p) => s + p.pending_lines, 0))} icon={Users} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Purchase Need by Product</CardTitle>
          <p className="text-xs text-muted-foreground">
            Live shortage = customer backorder demand minus stock already allocated. Click a product to see who's waiting.
          </p>
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
                    <TableHead className="text-center">Shortage Qty</TableHead>
                    <TableHead className="text-center">Suggested Purchase</TableHead>
                    <TableHead className="text-center">Customers Waiting</TableHead>
                    <TableHead className="text-center">Oldest Demand</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(products ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                            <TableCell colSpan={8} className="bg-muted/20 p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                                Customers waiting (oldest first)
                              </p>
                              {(!drillRows || drillRows.length === 0) ? (
                                <p className="text-xs text-muted-foreground">No detail rows.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {drillRows.map((r) => (
                                    <div
                                      key={`${r.sale_id}-${r.product_id}`}
                                      className="flex items-center justify-between gap-3 text-sm p-2 rounded bg-card border"
                                    >
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
                                      </div>
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
    </div>
  );
}

/** Customer / Site Demand Breakdown — flat list of all open shortage lines */
export function CustomerSiteDemandReport({ dealerId }: ReportProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["purchase-planning-all-customers", dealerId],
    queryFn: () => purchasePlanningService.customerShortages(dealerId),
    enabled: !!dealerId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Customer / Site Demand Breakdown</CardTitle>
        <p className="text-xs text-muted-foreground">
          Every open shortage line, ordered by oldest demand first. Use this to prioritise purchase planning by customer urgency.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Project / Site</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Shortage Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No open shortage demand
                    </TableCell>
                  </TableRow>
                ) : (data ?? []).map((r) => (
                  <TableRow key={`${r.sale_id}-${r.product_id}`}>
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
