import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Folder, MapPin, Users, Package } from "lucide-react";
import { purchasePlanningService } from "@/services/purchasePlanningService";
import { ShortageStatusBadge } from "@/components/CreatePurchaseDraftDialog";

interface Props { dealerId: string }

function daysWaiting(dateStr: string | null): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  const today = new Date();
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Project / Site Shortage Report — Batch 3 visibility layer.
 * Shows backorder demand grouped by project › site › customer, with a drill-down
 * into the detail rows. Customer-only (no-project) shortages still appear as
 * "Direct Sale" so dealers don't lose them.
 *
 * Read-only: no stock or ledger side effect.
 */
export function ProjectSiteShortageReport({ dealerId }: Props) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "with-project" | "direct">("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["purchase-planning-projects", dealerId],
    queryFn: () => purchasePlanningService.projectSiteShortages(dealerId),
    enabled: !!dealerId,
  });

  const { data: details = [] } = useQuery({
    queryKey: ["purchase-planning-all-customers-for-projects", dealerId],
    queryFn: () => purchasePlanningService.customerShortages(dealerId),
    enabled: !!dealerId,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (scope === "with-project" && !g.project_id) return false;
      if (scope === "direct" && g.project_id) return false;
      if (!q) return true;
      return [g.project_name, g.site_name ?? "", g.customer_name]
        .join(" ").toLowerCase().includes(q);
    });
  }, [groups, search, scope]);

  const totalShortage = filtered.reduce((s, g) => s + g.shortage_qty, 0);
  const totalProjects = new Set(filtered.map((g) => g.project_id ?? `_${g.customer_id}`)).size;
  const totalSites = new Set(
    filtered.filter((g) => g.site_id).map((g) => g.site_id!),
  ).size;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <SummaryTile label="Project/Site Groups" value={String(filtered.length)} icon={Folder} />
        <SummaryTile label="Total Shortage Qty" value={String(totalShortage)} icon={Package} accent="warning" />
        <SummaryTile label="Distinct Sites" value={String(totalSites)} icon={MapPin} />
        <SummaryTile label="Distinct Buyers" value={String(totalProjects)} icon={Users} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-base">Shortage by Project / Site / Customer</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Backorder demand rolled up by project and site. Click a row to see the underlying
              customer demand lines. Direct (no-project) sales remain visible so customer-only
              shortages aren&apos;t lost.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Search project / site / customer…"
              className="h-8 text-xs sm:w-[260px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={scope} onValueChange={(v: typeof scope) => setScope(v)}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shortages</SelectItem>
                <SelectItem value="with-project">Project / Site only</SelectItem>
                <SelectItem value="direct">Direct sales only</SelectItem>
              </SelectContent>
            </Select>
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
                    <TableHead>Project / Site</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-center">Lines</TableHead>
                    <TableHead className="text-center">Products</TableHead>
                    <TableHead className="text-center">Shortage</TableHead>
                    <TableHead className="text-center">Planned In</TableHead>
                    <TableHead className="text-center">Net Open</TableHead>
                    <TableHead className="text-center">Waiting</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No shortages match this filter
                      </TableCell>
                    </TableRow>
                  ) : filtered.map((g) => {
                    const isOpen = expandedKey === g.key;
                    const subRows = details.filter(
                      (d) =>
                        (d.project_id ?? null) === g.project_id &&
                        (d.site_id ?? null) === g.site_id &&
                        (d.customer_id || null) === g.customer_id,
                    );
                    const days = daysWaiting(g.oldest_demand_date);
                    return (
                      <>
                        <TableRow
                          key={g.key}
                          className={isOpen ? "bg-muted/50" : "cursor-pointer hover:bg-muted/30"}
                          onClick={() => setExpandedKey(isOpen ? null : g.key)}
                        >
                          <TableCell>
                            {g.project_id ? (
                              <div className="flex flex-col">
                                <span className="font-medium flex items-center gap-1">
                                  <Folder className="h-3 w-3 text-primary" />
                                  {g.project_name}
                                </span>
                                {g.site_name && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1 ml-4">
                                    <MapPin className="h-3 w-3" /> {g.site_name}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <Badge variant="outline" className="text-xs">Direct Sale</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{g.customer_name}</TableCell>
                          <TableCell className="text-center">{g.pending_lines}</TableCell>
                          <TableCell className="text-center">{g.pending_products}</TableCell>
                          <TableCell className="text-center font-semibold text-amber-600">
                            {g.shortage_qty}
                          </TableCell>
                          <TableCell className="text-center text-blue-600">{g.planned_qty}</TableCell>
                          <TableCell className="text-center font-bold text-amber-700">
                            {g.open_qty}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {days > 0 ? (
                              <Badge
                                variant="outline"
                                className={
                                  days > 14
                                    ? "bg-destructive/10 text-destructive border-destructive/30"
                                    : days > 7
                                    ? "bg-amber-500/10 text-amber-700 border-amber-300"
                                    : ""
                                }
                              >
                                {days}d
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow key={`${g.key}-detail`}>
                            <TableCell colSpan={8} className="bg-muted/20 p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                                Demand lines ({subRows.length})
                              </p>
                              {subRows.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No detail rows.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {subRows.map((r) => (
                                    <div
                                      key={r.sale_item_id}
                                      className="flex items-center gap-3 text-sm p-2 rounded bg-card border flex-wrap"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <span className="font-medium">{r.product_name}</span>
                                        <span className="text-xs text-muted-foreground ml-1">
                                          ({r.product_sku})
                                        </span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                          {r.invoice_number ?? "—"} • {r.sale_date}
                                        </span>
                                        {(r.preferred_shade_code || r.preferred_caliber) && (
                                          <Badge
                                            variant="outline"
                                            className="ml-2 text-xs bg-orange-500/10 text-orange-700 border-orange-300"
                                          >
                                            {[r.preferred_shade_code, r.preferred_caliber]
                                              .filter(Boolean)
                                              .join(" / ")}
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
    </div>
  );
}

function SummaryTile({
  label, value, icon: Icon, accent = "default",
}: {
  label: string; value: string; icon: React.ElementType; accent?: "default" | "warning";
}) {
  const accentClass = accent === "warning" ? "text-amber-600" : "text-foreground";
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
