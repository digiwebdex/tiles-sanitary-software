import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Phone, User, FileText, Receipt, Truck, FileSignature, ExternalLink } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { projectReportService } from "@/services/projectReportService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  siteId: string | null;
}

const statusColor = (s: string) => {
  if (s === "delivered" || s === "completed" || s === "converted") return "bg-green-100 text-green-800 border-green-300";
  if (s === "cancelled" || s === "expired") return "bg-red-100 text-red-800 border-red-300";
  if (s === "in_transit" || s === "dispatched") return "bg-blue-100 text-blue-800 border-blue-300";
  return "bg-yellow-100 text-yellow-800 border-yellow-300";
};

export function SiteHistoryDialog({ open, onOpenChange, dealerId, siteId }: Props) {
  const navigate = useNavigate();

  const summaryQ = useQuery({
    queryKey: ["site-summary", dealerId, siteId],
    queryFn: () => projectReportService.siteSummary(dealerId, siteId!),
    enabled: !!siteId && open,
  });

  const historyQ = useQuery({
    queryKey: ["site-history", dealerId, siteId],
    queryFn: () => projectReportService.siteHistory(dealerId, siteId!),
    enabled: !!siteId && open,
  });

  const site = summaryQ.data?.site;
  const summary = summaryQ.data?.summary;
  const history = historyQ.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {site?.site_name ?? "Site History"}
          </DialogTitle>
          <DialogDescription>
            {site?.projects && (
              <>
                <span className="font-medium text-foreground">{site.projects.project_name}</span>
                <span className="text-muted-foreground"> · {site.projects.project_code}</span>
                {site.customers?.name && <> · {site.customers.name}</>}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {summaryQ.isLoading || historyQ.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : !site ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Site not found.</p>
        ) : (
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-4">
              {/* Site contact info */}
              {(site.address || site.contact_person || site.contact_phone) && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                  {site.address && (
                    <div className="flex gap-2"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" /><span>{site.address}</span></div>
                  )}
                  {site.contact_person && (
                    <div className="flex gap-2"><User className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" /><span>{site.contact_person}</span></div>
                  )}
                  {site.contact_phone && (
                    <div className="flex gap-2"><Phone className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" /><span>{site.contact_phone}</span></div>
                  )}
                </div>
              )}

              {/* Summary tiles */}
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <SummaryTile label="Quotations" value={summary.quotation_count} />
                  <SummaryTile label="Sales" value={summary.sales_count} sub={formatCurrency(summary.billed)} />
                  <SummaryTile label="Deliveries" value={summary.delivery_count} sub={summary.pending_deliveries > 0 ? `${summary.pending_deliveries} pending` : "all done"} highlight={summary.pending_deliveries > 0 ? "warn" : undefined} />
                  <SummaryTile label="Outstanding" value={formatCurrency(summary.outstanding)} highlight={summary.outstanding > 0 ? "danger" : undefined} />
                </div>
              )}

              {history && (
                <>
                  {/* Quotations */}
                  {history.quotations.length > 0 && (
                    <Section title="Quotations" icon={<FileSignature className="h-3.5 w-3.5" />} count={history.quotations.length}>
                      {history.quotations.map((q: any) => (
                        <Row
                          key={q.id}
                          title={q.quotation_no}
                          subtitle={q.quote_date}
                          right={<>
                            <Badge variant="outline" className={`text-[10px] ${statusColor(q.status)}`}>{q.status}</Badge>
                            <span className="font-semibold">{formatCurrency(q.total_amount)}</span>
                          </>}
                          onClick={() => { navigate(`/quotations`); onOpenChange(false); }}
                        />
                      ))}
                    </Section>
                  )}

                  {/* Sales */}
                  {history.sales.length > 0 && (
                    <Section title="Sales" icon={<Receipt className="h-3.5 w-3.5" />} count={history.sales.length}>
                      {history.sales.map((s: any) => (
                        <Row
                          key={s.id}
                          title={s.invoice_number ?? "—"}
                          subtitle={s.sale_date}
                          right={<>
                            <Badge variant="outline" className={`text-[10px] ${statusColor(s.sale_status)}`}>
                              {String(s.sale_status ?? "").replace(/_/g, " ")}
                            </Badge>
                            <span className="font-semibold">{formatCurrency(s.total_amount)}</span>
                          </>}
                          onClick={() => { navigate(`/sales/${s.id}/invoice`); onOpenChange(false); }}
                        />
                      ))}
                    </Section>
                  )}

                  {/* Challans */}
                  {history.challans.length > 0 && (
                    <Section title="Challans" icon={<FileText className="h-3.5 w-3.5" />} count={history.challans.length}>
                      {history.challans.map((c: any) => (
                        <Row
                          key={c.id}
                          title={c.challan_no}
                          subtitle={c.challan_date}
                          right={<Badge variant="outline" className={`text-[10px] ${statusColor(c.delivery_status ?? c.status)}`}>{String(c.delivery_status ?? c.status ?? "")}</Badge>}
                          onClick={() => { navigate(`/challans`); onOpenChange(false); }}
                        />
                      ))}
                    </Section>
                  )}

                  {/* Deliveries */}
                  {history.deliveries.length > 0 && (
                    <Section title="Deliveries" icon={<Truck className="h-3.5 w-3.5" />} count={history.deliveries.length}>
                      {history.deliveries.map((d: any) => (
                        <Row
                          key={d.id}
                          title={d.delivery_no ?? "—"}
                          subtitle={d.delivery_date}
                          right={<Badge variant="outline" className={`text-[10px] ${statusColor(d.status)}`}>{String(d.status ?? "")}</Badge>}
                          onClick={() => { navigate(`/deliveries`); onOpenChange(false); }}
                        />
                      ))}
                    </Section>
                  )}

                  {history.quotations.length === 0 && history.sales.length === 0 && history.challans.length === 0 && history.deliveries.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-4 text-center">No transactions linked to this site yet.</p>
                  )}
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => { navigate(`/deliveries?site=${siteId}`); onOpenChange(false); }}>
                  <Truck className="h-3.5 w-3.5 mr-1" /> Open in Deliveries
                </Button>
                <Button variant="outline" size="sm" onClick={() => { navigate(`/sales?site=${siteId}`); onOpenChange(false); }}>
                  <Receipt className="h-3.5 w-3.5 mr-1" /> Open in Sales
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({ label, value, sub, highlight }: { label: string; value: string | number; sub?: string; highlight?: "danger" | "warn" }) {
  const cls = highlight === "danger"
    ? "border-destructive/30 bg-destructive/5"
    : highlight === "warn"
    ? "border-orange-500/40 bg-orange-50 dark:bg-orange-900/10"
    : "bg-muted/30";
  const textCls = highlight === "danger" ? "text-destructive" : "";
  return (
    <div className={`rounded-md border px-3 py-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={`text-sm font-bold ${textCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="text-xs font-semibold mb-1.5 flex items-center gap-1 text-muted-foreground uppercase tracking-wider">
        {icon} {title} ({count})
      </h5>
      <div className="rounded-md border divide-y">{children}</div>
    </div>
  );
}

function Row({ title, subtitle, right, onClick }: { title: string; subtitle: string; right: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50 cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-foreground">{title}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{subtitle}</span>
        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </div>
      <div className="flex items-center gap-2 shrink-0">{right}</div>
    </div>
  );
}

export default SiteHistoryDialog;
