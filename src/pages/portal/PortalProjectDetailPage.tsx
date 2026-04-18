import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Building2 } from "lucide-react";
import { getPortalProjectSummary, type PortalProjectSummary } from "@/services/portalService";
import { PortalListSkeleton } from "./PortalLayout";

const fmtBDT = (n: number | null | undefined) =>
  `৳${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtQty = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function PortalProjectDetailPage() {
  const { id = "" } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "project-summary", id],
    queryFn: () => getPortalProjectSummary(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PortalListSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Unable to load project.
        </CardContent>
      </Card>
    );
  }

  if ("error" in data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {data.error === "forbidden"
            ? "You do not have access to this project."
            : "Project not found."}
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/portal/projects">
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to projects
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = data as PortalProjectSummary;
  const totals = summary.items.reduce(
    (acc, it) => {
      acc.ordered += Number(it.ordered_qty || 0);
      acc.delivered += Number(it.delivered_qty || 0);
      return acc;
    },
    { ordered: 0, delivered: 0 },
  );
  const fulfillmentPct =
    totals.ordered > 0 ? Math.round((totals.delivered / totals.ordered) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/portal/projects">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Projects
            </Link>
          </Button>
        </div>
      </div>

      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <span>{summary.project.project_name}</span>
          </CardTitle>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground pt-1">
            <span className="font-mono">{summary.project.project_code}</span>
            <span>·</span>
            <Badge variant={summary.project.status === "active" ? "default" : "secondary"}>
              {summary.project.status}
            </Badge>
            {summary.project.start_date && <span>Start: {summary.project.start_date}</span>}
            {summary.project.expected_end_date && (
              <span>Expected end: {summary.project.expected_end_date}</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Sites" value={String(summary.sites.length)} />
          <Stat label="Quotations" value={String(summary.quotations.length)} />
          <Stat label="Orders" value={String(summary.sales.length)} />
          <Stat label="Fulfillment" value={`${fulfillmentPct}%`} />
        </CardContent>
      </Card>

      {/* Sites */}
      {summary.sites.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.sites.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.site_name}</TableCell>
                      <TableCell className="text-muted-foreground">{s.address ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "secondary"}>
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Item-level ordered vs delivered */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ordered vs Delivered</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items linked to this project yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.items.map((it) => (
                    <TableRow key={it.product_id}>
                      <TableCell className="font-medium">{it.product_name}</TableCell>
                      <TableCell className="font-mono text-xs">{it.product_sku}</TableCell>
                      <TableCell className="text-right">{fmtQty(it.ordered_qty)}</TableCell>
                      <TableCell className="text-right">{fmtQty(it.delivered_qty)}</TableCell>
                      <TableCell
                        className={`text-right ${it.pending_qty > 0 ? "text-destructive font-semibold" : ""}`}
                      >
                        {fmtQty(it.pending_qty)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quotations */}
      {summary.quotations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Linked quotations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quotation No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.quotations.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-medium">
                        {q.quotation_no}
                        {q.revision_no > 1 && (
                          <span className="text-xs text-muted-foreground"> · rev {q.revision_no}</span>
                        )}
                      </TableCell>
                      <TableCell>{q.quote_date}</TableCell>
                      <TableCell>
                        <Badge variant={q.status === "active" ? "default" : "secondary"}>
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmtBDT(q.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sales */}
      {summary.sales.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Linked orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.invoice_number ?? s.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{s.sale_date}</TableCell>
                      <TableCell>
                        <Badge variant={s.sale_status === "paid" ? "default" : "secondary"}>
                          {s.sale_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmtBDT(s.total_amount)}</TableCell>
                      <TableCell className="text-right">{fmtBDT(s.paid_amount)}</TableCell>
                      <TableCell
                        className={`text-right ${s.due_amount > 0 ? "text-destructive font-semibold" : ""}`}
                      >
                        {fmtBDT(s.due_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deliveries */}
      {summary.deliveries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Delivery No.</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.deliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.delivery_no ?? d.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>{d.invoice_number ?? "—"}</TableCell>
                      <TableCell>{d.delivery_date}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === "delivered" ? "default" : "secondary"}>
                          {d.status ?? "pending"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
