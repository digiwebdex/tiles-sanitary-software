import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Receipt, Truck, PackageCheck, FileText, FileSignature } from "lucide-react";

interface Props {
  dealerId: string;
  projectId: string;
}

interface ProjectActivity {
  sales: any[];
  challans: any[];
  deliveries: any[];
  summary: {
    sales_count: number;
    total_sales: number;
    total_paid: number;
    outstanding: number;
    challan_count: number;
    delivery_count: number;
    pending_deliveries: number;
    latest_activity: string | null;
  };
}

async function loadProjectHistory(
  dealerId: string,
  projectId: string,
): Promise<ProjectActivity & { quotations: any[]; quotation_count: number }> {
  const params = new URLSearchParams({ dealerId, projectId });
  const res = await vpsAuthedFetch(`/api/reports/projects/history?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `Failed to load project history (${res.status})`);
  }
  return res.json();
}

const statusColor = (s: string) => {
  if (s === "delivered" || s === "completed") return "bg-green-100 text-green-800 border-green-300";
  if (s === "cancelled") return "bg-red-100 text-red-800 border-red-300";
  if (s === "in_transit" || s === "dispatched") return "bg-blue-100 text-blue-800 border-blue-300";
  return "bg-yellow-100 text-yellow-800 border-yellow-300";
};

export function ProjectHistoryPanel({ dealerId, projectId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["project-history", dealerId, projectId],
    queryFn: () => loadProjectHistory(dealerId, projectId),
    enabled: !!dealerId && !!projectId,
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-3">Loading history…</p>;
  if (!data) return null;

  const { sales, challans, deliveries, quotations, summary } = data;

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="rounded-md border bg-muted/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Quotations</p>
          <p className="text-sm font-bold">{quotations.length}</p>
        </div>
        <div className="rounded-md border bg-muted/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Sales</p>
          <p className="text-sm font-bold">{summary.sales_count} · {formatCurrency(summary.total_sales)}</p>
        </div>
        <div className={`rounded-md border px-3 py-2 ${summary.outstanding > 0 ? "border-destructive/30 bg-destructive/5" : "bg-muted/30"}`}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Outstanding</p>
          <p className={`text-sm font-bold ${summary.outstanding > 0 ? "text-destructive" : ""}`}>{formatCurrency(summary.outstanding)}</p>
        </div>
        <div className="rounded-md border bg-muted/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Challans</p>
          <p className="text-sm font-bold">{summary.challan_count}</p>
        </div>
        <div className={`rounded-md border px-3 py-2 ${summary.pending_deliveries > 0 ? "border-orange-500/40 bg-orange-50 dark:bg-orange-900/10" : "bg-muted/30"}`}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Deliveries</p>
          <p className="text-sm font-bold">
            {summary.delivery_count}
            {summary.pending_deliveries > 0 && <span className="text-orange-600 ml-1">({summary.pending_deliveries} pending)</span>}
          </p>
        </div>
      </div>
      {summary.latest_activity && (
        <p className="text-[11px] text-muted-foreground">Latest activity: <span className="font-medium text-foreground">{summary.latest_activity}</span></p>
      )}

      {sales.length === 0 && challans.length === 0 && deliveries.length === 0 && quotations.length === 0 && (
        <p className="text-xs text-muted-foreground italic py-2">No transactions linked to this project yet.</p>
      )}

      {/* Quotations */}
      {quotations.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold mb-1.5 flex items-center gap-1 text-muted-foreground uppercase tracking-wider">
            <FileSignature className="h-3 w-3" /> Quotations ({quotations.length})
          </h5>
          <div className="rounded-md border divide-y">
            {quotations.slice(0, 10).map((q: any) => (
              <div key={q.id} className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50 cursor-pointer" onClick={() => navigate("/quotations")}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-foreground">{q.quotation_no}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{q.quote_date}</span>
                  {q.project_sites?.site_name && (
                    <span className="text-muted-foreground truncate">· {q.project_sites.site_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[10px] ${statusColor(q.status)}`}>{q.status}</Badge>
                  <span className="font-semibold">{formatCurrency(q.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sales */}
      {sales.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold mb-1.5 flex items-center gap-1 text-muted-foreground uppercase tracking-wider">
            <Receipt className="h-3 w-3" /> Sales ({sales.length})
          </h5>
          <div className="rounded-md border divide-y">
            {sales.slice(0, 10).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/sales/${s.id}/invoice`)}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-foreground">{s.invoice_number ?? "—"}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{s.sale_date}</span>
                  {s.project_sites?.site_name && (
                    <span className="text-muted-foreground truncate">· {s.project_sites.site_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[10px] ${statusColor(s.sale_status)}`}>
                    {String(s.sale_status ?? "").replace(/_/g, " ")}
                  </Badge>
                  <span className="font-semibold">{formatCurrency(s.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Challans */}
      {challans.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold mb-1.5 flex items-center gap-1 text-muted-foreground uppercase tracking-wider">
            <FileText className="h-3 w-3" /> Challans ({challans.length})
          </h5>
          <div className="rounded-md border divide-y">
            {challans.slice(0, 10).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50 cursor-pointer" onClick={() => navigate("/challans")}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-foreground">{c.challan_no}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{c.challan_date}</span>
                  {c.project_sites?.site_name && (
                    <span className="text-muted-foreground truncate">· {c.project_sites.site_name}</span>
                  )}
                </div>
                <Badge variant="outline" className={`text-[10px] ${statusColor(c.delivery_status ?? c.status)}`}>
                  {String(c.delivery_status ?? c.status ?? "")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deliveries */}
      {deliveries.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold mb-1.5 flex items-center gap-1 text-muted-foreground uppercase tracking-wider">
            <Truck className="h-3 w-3" /> Deliveries ({deliveries.length})
          </h5>
          <div className="rounded-md border divide-y">
            {deliveries.slice(0, 10).map((d: any) => (
              <div key={d.id} className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50 cursor-pointer" onClick={() => navigate("/deliveries")}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-foreground">{d.delivery_no ?? "—"}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{d.delivery_date}</span>
                  {d.project_sites?.site_name && (
                    <span className="text-muted-foreground truncate">· {d.project_sites.site_name}</span>
                  )}
                </div>
                <Badge variant="outline" className={`text-[10px] ${statusColor(d.status)}`}>
                  {d.status === "delivered" ? <><PackageCheck className="h-2.5 w-2.5 mr-0.5 inline" />Delivered</> : String(d.status ?? "")}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectHistoryPanel;
