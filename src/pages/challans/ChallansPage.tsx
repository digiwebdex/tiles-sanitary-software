import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { challanService } from "@/services/challanService";
import { useDealerId } from "@/hooks/useDealerId";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Eye, EyeOff, FileText, Truck, Send, PackageCheck, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ProjectSiteFilter } from "@/components/project/ProjectSiteFilter";

const statusStyles: Record<string, string> = {
  pending: "bg-blue-100 text-blue-800 border-blue-300",
  delivered: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

const ChallansPage = () => {
  const dealerId = useDealerId();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);

  const { data: challans = [], isLoading } = useQuery({
    queryKey: ["challans-list", dealerId, projectId, siteId],
    queryFn: () => challanService.list(dealerId, { projectId, siteId }),
    enabled: !!dealerId,
  });

  const filtered = challans.filter((c: any) => {
    const q = search.toLowerCase();
    if (!q) return true;
    const customerName = c.sales?.customers?.name ?? "";
    return (
      c.challan_no?.toLowerCase().includes(q) ||
      customerName.toLowerCase().includes(q) ||
      c.sales?.invoice_number?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Challans</h1>
          <p className="text-sm text-muted-foreground">Manage delivery challans</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by challan no, customer, or invoice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <ProjectSiteFilter
          dealerId={dealerId}
          projectId={projectId}
          siteId={siteId}
          onChange={({ projectId: pid, siteId: sid }) => { setProjectId(pid); setSiteId(sid); }}
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-12 w-12 mb-3 opacity-30" />
          <p>No challans found</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Challan No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Project / Site</TableHead>
                <TableHead>Invoice Ref</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c: any) => {
                const project = (c as any).projects;
                const site = (c as any).project_sites;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-medium">{c.challan_no}</TableCell>
                    <TableCell>{format(new Date(c.challan_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{c.sales?.customers?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {project ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{project.project_name}</span>
                          {site && (
                            <span className="text-muted-foreground inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {site.site_name}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.sales?.invoice_number ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyles[c.status] ?? ""}>
                        {c.status?.charAt(0).toUpperCase() + c.status?.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={(c as any).show_price
                        ? "bg-green-100 text-green-800 border-green-300"
                        : "bg-amber-100 text-amber-800 border-amber-300"
                      }>
                        {(c as any).show_price
                          ? <><Eye className="h-3 w-3 mr-1 inline" />Visible</>
                          : <><EyeOff className="h-3 w-3 mr-1 inline" />Hidden</>
                        }
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const ds = (c as any).delivery_status ?? "pending";
                        const icon = ds === "delivered" ? <PackageCheck className="h-3 w-3 mr-1 inline" /> : ds === "dispatched" ? <Send className="h-3 w-3 mr-1 inline" /> : <Truck className="h-3 w-3 mr-1 inline" />;
                        const cls = ds === "delivered" ? "bg-green-100 text-green-800 border-green-300" : ds === "dispatched" ? "bg-blue-100 text-blue-800 border-blue-300" : "bg-yellow-100 text-yellow-800 border-yellow-300";
                        return <Badge variant="outline" className={`text-xs ${cls}`}>{icon}{ds.charAt(0).toUpperCase() + ds.slice(1)}</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/challans/${c.id}`)}
                      >
                        <Eye className="mr-1 h-4 w-4" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default ChallansPage;
