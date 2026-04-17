import { useEffect, useState } from "react";
import { useDealerId } from "@/hooks/useDealerId";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { MonitorSpeaker, Send, Package } from "lucide-react";
import {
  displayStockService,
  sampleIssueService,
  type DisplayStockRow,
  type SampleIssueRow,
} from "@/services/displayStockService";
import { MoveToDisplayDialog } from "./MoveToDisplayDialog";
import { IssueSampleDialog } from "./IssueSampleDialog";

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "issued":
      return "default";
    case "partially_returned":
      return "secondary";
    case "returned":
      return "outline";
    case "damaged":
    case "lost":
      return "destructive";
    default:
      return "outline";
  }
};

const formatQty = (qty: number, unit?: string) => `${Number(qty).toLocaleString()} ${unit === "piece" ? "pcs" : "box"}`;

export default function DisplaySampleStockPage() {
  const dealerId = useDealerId();
  const { isDealerAdmin, isSuperAdmin } = usePermissions();
  const canMove = isDealerAdmin || isSuperAdmin;

  const [displayRows, setDisplayRows] = useState<DisplayStockRow[]>([]);
  const [samples, setSamples] = useState<SampleIssueRow[]>([]);
  const [stats, setStats] = useState({ outstandingSamples: 0, totalDisplayQty: 0 });
  const [loading, setLoading] = useState(true);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [d, s, st] = await Promise.all([
        displayStockService.list(dealerId),
        sampleIssueService.list(dealerId),
        sampleIssueService.getDashboardStats(dealerId),
      ]);
      setDisplayRows(d);
      setSamples(s);
      setStats(st);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load display/sample stock");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerId]);

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Display & Sample Stock</h1>
          <p className="text-sm text-muted-foreground">
            Track showroom display items and samples issued to customers, architects, and contractors.
          </p>
        </div>
        <div className="flex gap-2">
          {canMove && (
            <Button variant="outline" onClick={() => setMoveDialogOpen(true)}>
              <MonitorSpeaker className="mr-2 h-4 w-4" /> Move to Display
            </Button>
          )}
          <Button onClick={() => setIssueDialogOpen(true)}>
            <Send className="mr-2 h-4 w-4" /> Issue Sample
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Display Items</CardTitle>
            <MonitorSpeaker className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDisplayQty.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Units currently on showroom display</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Samples</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.outstandingSamples}</div>
            <p className="text-xs text-muted-foreground">Issued samples awaiting return</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Sample Records</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{samples.length}</div>
            <p className="text-xs text-muted-foreground">All-time sample issues</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="display">
        <TabsList>
          <TabsTrigger value="display">Display Stock ({displayRows.length})</TabsTrigger>
          <TabsTrigger value="samples">Sample Issues ({samples.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="display" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Display Qty</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && displayRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No display stock yet. Use “Move to Display” to add items.
                      </TableCell>
                    </TableRow>
                  )}
                  {displayRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.product?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.product?.sku ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatQty(r.display_qty, r.product?.unit_type)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.notes ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.updated_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="samples" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && samples.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No samples issued yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {samples.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{s.issue_date}</TableCell>
                      <TableCell>
                        <div className="font-medium">{s.product?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s.product?.sku ?? ""}</div>
                      </TableCell>
                      <TableCell>
                        <div>{s.recipient_name}</div>
                        {s.recipient_phone && (
                          <div className="text-xs text-muted-foreground">{s.recipient_phone}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{s.recipient_type}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatQty(s.quantity, s.product?.unit_type)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatQty(s.returned_qty, s.product?.unit_type)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(s.status)}>{s.status.replace("_", " ")}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <MoveToDisplayDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        dealerId={dealerId}
        onSuccess={refresh}
      />
      <IssueSampleDialog
        open={issueDialogOpen}
        onOpenChange={setIssueDialogOpen}
        dealerId={dealerId}
        onSuccess={refresh}
      />
    </div>
  );
}
