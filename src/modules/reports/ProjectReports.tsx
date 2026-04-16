import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, Folder, MapPin, FileSignature, TrendingUp, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/exportUtils";
import { projectReportService } from "@/services/projectReportService";
import { toast } from "sonner";

interface Props { dealerId: string }

// ─── Sales by Project ────────────────────────────────────────
export function SalesByProjectReport({ dealerId }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-sales-by-project", dealerId],
    queryFn: () => projectReportService.salesByProject(dealerId),
  });

  const handleExport = () => {
    exportToExcel(data, [
      { header: "Project", key: "project_name" },
      { header: "Code", key: "project_code" },
      { header: "Customer", key: "customer_name" },
      { header: "Invoices", key: "invoice_count" },
      { header: "Total Sales", key: "total_sales", format: "currency" },
      { header: "Outstanding", key: "outstanding", format: "currency" },
    ], `sales-by-project-${new Date().toISOString().split("T")[0]}`);
    toast.success("Exported");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> Sales by Project</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={data.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p>
        : data.length === 0 ? <p className="text-muted-foreground text-sm">No project sales found.</p>
        : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Total Sales</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(r => (
                <TableRow key={r.project_id}>
                  <TableCell>
                    <div className="font-medium">{r.project_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.project_code}</div>
                  </TableCell>
                  <TableCell>{r.customer_name}</TableCell>
                  <TableCell className="text-right">{r.invoice_count}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(r.total_sales)}</TableCell>
                  <TableCell className={`text-right ${r.outstanding > 0 ? "text-destructive font-semibold" : ""}`}>
                    {formatCurrency(r.outstanding)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Outstanding by Project ────────────────────────────────────
export function OutstandingByProjectReport({ dealerId }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-outstanding-by-project", dealerId],
    queryFn: () => projectReportService.outstandingByProject(dealerId),
  });

  const totals = data.reduce(
    (acc, r) => ({
      billed: acc.billed + r.billed,
      paid: acc.paid + r.paid,
      due: acc.due + r.due,
      overdue: acc.overdue + r.overdue,
    }),
    { billed: 0, paid: 0, due: 0, overdue: 0 },
  );

  const handleExport = () => {
    exportToExcel(data, [
      { header: "Project", key: "project_name" },
      { header: "Code", key: "project_code" },
      { header: "Customer", key: "customer_name" },
      { header: "Billed", key: "billed", format: "currency" },
      { header: "Paid", key: "paid", format: "currency" },
      { header: "Due", key: "due", format: "currency" },
      { header: "Overdue", key: "overdue", format: "currency" },
    ], `outstanding-by-project-${new Date().toISOString().split("T")[0]}`);
    toast.success("Exported");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Folder className="h-5 w-5" /> Outstanding by Project</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={data.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p>
        : data.length === 0 ? <p className="text-muted-foreground text-sm">No project outstanding found.</p>
        : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Billed</p>
                <p className="text-sm font-bold">{formatCurrency(totals.billed)}</p>
              </div>
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Paid</p>
                <p className="text-sm font-bold text-green-600">{formatCurrency(totals.paid)}</p>
              </div>
              <div className={`rounded-md border px-3 py-2 ${totals.due > 0 ? "border-destructive/30 bg-destructive/5" : "bg-muted/30"}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total Due</p>
                <p className={`text-sm font-bold ${totals.due > 0 ? "text-destructive" : ""}`}>{formatCurrency(totals.due)}</p>
              </div>
              <div className={`rounded-md border px-3 py-2 ${totals.overdue > 0 ? "border-destructive/40 bg-destructive/10" : "bg-muted/30"}`}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Overdue</p>
                <p className={`text-sm font-bold ${totals.overdue > 0 ? "text-destructive" : ""}`}>{formatCurrency(totals.overdue)}</p>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map(r => (
                  <TableRow key={r.project_id}>
                    <TableCell>
                      <div className="font-medium">{r.project_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.project_code}</div>
                    </TableCell>
                    <TableCell>{r.customer_name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.billed)}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(r.paid)}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.due > 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(r.due)}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${r.overdue > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {r.overdue > 0 ? formatCurrency(r.overdue) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Delivery History by Site ─────────────────────────────────
export function DeliveryHistoryBySiteReport({ dealerId }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-delivery-history-by-site", dealerId],
    queryFn: () => projectReportService.deliveryHistoryBySite(dealerId),
  });

  const handleExport = () => {
    exportToExcel(data, [
      { header: "Site", key: "site_name" },
      { header: "Project", key: "project_name" },
      { header: "Customer", key: "customer_name" },
      { header: "Address", key: "site_address" },
      { header: "Challans", key: "challan_count" },
      { header: "Deliveries", key: "delivery_count" },
      { header: "Pending", key: "pending_deliveries" },
      { header: "Latest Delivery", key: "latest_delivery_date" },
    ], `delivery-history-by-site-${new Date().toISOString().split("T")[0]}`);
    toast.success("Exported");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Delivery History by Site</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={data.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p>
        : data.length === 0 ? <p className="text-muted-foreground text-sm">No site delivery history.</p>
        : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Project / Customer</TableHead>
                <TableHead className="text-right">Challans</TableHead>
                <TableHead className="text-right">Deliveries</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead>Latest</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(r => (
                <TableRow key={r.site_id}>
                  <TableCell>
                    <div className="font-medium">{r.site_name}</div>
                    {r.site_address && <div className="text-xs text-muted-foreground">{r.site_address}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{r.project_name}</div>
                    <div className="text-xs text-muted-foreground">{r.customer_name}</div>
                  </TableCell>
                  <TableCell className="text-right">{r.challan_count}</TableCell>
                  <TableCell className="text-right">{r.delivery_count}</TableCell>
                  <TableCell className="text-right">
                    {r.pending_deliveries > 0
                      ? <Badge variant="outline" className="border-orange-500 text-orange-600">{r.pending_deliveries}</Badge>
                      : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="text-xs">{r.latest_delivery_date ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Project Quotation Pipeline ────────────────────────────────
export function ProjectQuotationPipelineReport({ dealerId }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-project-quotation-pipeline", dealerId],
    queryFn: () => projectReportService.quotationPipeline(dealerId),
  });

  const handleExport = () => {
    exportToExcel(data, [
      { header: "Project", key: "project_name" },
      { header: "Code", key: "project_code" },
      { header: "Customer", key: "customer_name" },
      { header: "Quotes", key: "quote_count" },
      { header: "Active Value", key: "active_value", format: "currency" },
      { header: "Converted Value", key: "converted_value", format: "currency" },
      { header: "Expired/Lost", key: "expired_lost_value", format: "currency" },
    ], `project-quotation-pipeline-${new Date().toISOString().split("T")[0]}`);
    toast.success("Exported");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5" /> Project Quotation Pipeline</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={data.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p>
        : data.length === 0 ? <p className="text-muted-foreground text-sm">No quotations linked to projects.</p>
        : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Quotes</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Converted</TableHead>
                <TableHead className="text-right">Expired/Lost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(r => (
                <TableRow key={r.project_id}>
                  <TableCell>
                    <div className="font-medium">{r.project_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.project_code}</div>
                  </TableCell>
                  <TableCell>{r.customer_name}</TableCell>
                  <TableCell className="text-right">{r.quote_count}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.active_value)}</TableCell>
                  <TableCell className="text-right text-green-600 font-semibold">{formatCurrency(r.converted_value)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(r.expired_lost_value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Top Active Projects ───────────────────────────────────────
export function TopActiveProjectsReport({ dealerId }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["report-top-active-projects", dealerId],
    queryFn: () => projectReportService.topActiveProjects(dealerId, 20),
  });

  const handleExport = () => {
    exportToExcel(data, [
      { header: "Project", key: "project_name" },
      { header: "Code", key: "project_code" },
      { header: "Customer", key: "customer_name" },
      { header: "Activity Count", key: "activity_count" },
      { header: "Total Sales", key: "total_value", format: "currency" },
    ], `top-active-projects-${new Date().toISOString().split("T")[0]}`);
    toast.success("Exported");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Top Active Projects</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={data.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-muted-foreground">Loading…</p>
        : data.length === 0 ? <p className="text-muted-foreground text-sm">No project activity yet.</p>
        : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Activity</TableHead>
                <TableHead className="text-right">Total Sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r, i) => (
                <TableRow key={r.project_id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.project_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.project_code}</div>
                  </TableCell>
                  <TableCell>{r.customer_name}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">{r.activity_count}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(r.total_value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
