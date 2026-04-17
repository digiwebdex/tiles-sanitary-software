import { useEffect, useState } from "react";
import { useDealerId } from "@/hooks/useDealerId";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { MonitorSpeaker, Send, Package, MoreHorizontal, AlertTriangle, Clock } from "lucide-react";
import {
  displayStockService,
  sampleIssueService,
  type DisplayStockRow,
  type SampleIssueRow,
} from "@/services/displayStockService";
import { MoveToDisplayDialog } from "./MoveToDisplayDialog";
import { IssueSampleDialog } from "./IssueSampleDialog";
import { ReturnSampleDialog } from "./ReturnSampleDialog";
import { MarkLostSampleDialog } from "./MarkLostSampleDialog";
import { MoveBackToSellableDialog } from "./MoveBackToSellableDialog";

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "issued": return "default";
    case "partially_returned": return "secondary";
    case "returned": return "outline";
    case "damaged":
    case "lost": return "destructive";
    default: return "outline";
  }
};

const formatQty = (qty: number, unit?: string) =>
  `${Number(qty).toLocaleString()} ${unit === "piece" ? "pcs" : "box"}`;

export default function DisplaySampleStockPage() {
  const dealerId = useDealerId();
  const { isDealerAdmin, isSuperAdmin } = usePermissions();
  const canMove = isDealerAdmin || isSuperAdmin;

  const [displayRows, setDisplayRows] = useState<DisplayStockRow[]>([]);
  const [samples, setSamples] = useState<SampleIssueRow[]>([]);
  const [stats, setStats] = useState({
    outstandingSamples: 0,
    totalDisplayQty: 0,
    damagedLostCount: 0,
    oldestOutstandingDays: 0,
    oldestOutstandingDate: null as string | null,
  });
  const [loading, setLoading] = useState(true);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [returnDialog, setReturnDialog] = useState<SampleIssueRow | null>(null);
  const [lostDialog, setLostDialog] = useState<SampleIssueRow | null>(null);
  const [displayActionRow, setDisplayActionRow] = useState<DisplayStockRow | null>(null);

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

  const isOutstanding = (s: SampleIssueRow) =>
    s.status === "issued" || s.status === "partially_returned";

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Display Items</CardTitle>
            <MonitorSpeaker className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDisplayQty.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">On showroom display</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Pending Returns</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.outstandingSamples}</div>
            <p className="text-xs text-muted-foreground">Samples awaiting return</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Damaged / Lost</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.damagedLostCount}</div>
            <p className="text-xs text-muted-foreground">Samples written off</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium">Oldest Outstanding</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.oldestOutstandingDays > 0 ? `${stats.oldestOutstandingDays}d` : "—"}
            </div>
            <p className="text-xs text-muted-foreground">{stats.oldestOutstandingDate ?? "None"}</p>
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
                    {canMove && <TableHead className="w-[60px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={canMove ? 6 : 5} className="text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && displayRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={canMove ? 6 : 5} className="text-center text-muted-foreground">
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
                      {canMove && (
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setDisplayActionRow(r)}>
                            Manage
                          </Button>
                        </TableCell>
                      )}
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
                    <TableHead>Expected Return</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                  )}
                  {!loading && samples.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No samples issued yet.</TableCell></TableRow>
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
                      <TableCell className="text-sm">{s.expected_return_date ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatQty(s.quantity, s.product?.unit_type)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatQty(s.returned_qty, s.product?.unit_type)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(s.status)}>{s.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>
                        {isOutstanding(s) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setReturnDialog(s)}>
                                Return Sample
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setLostDialog(s)} className="text-destructive">
                                Mark Lost
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
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
      <ReturnSampleDialog
        open={!!returnDialog}
        onOpenChange={(o) => !o && setReturnDialog(null)}
        sample={returnDialog}
        dealerId={dealerId}
        onSuccess={refresh}
      />
      <MarkLostSampleDialog
        open={!!lostDialog}
        onOpenChange={(o) => !o && setLostDialog(null)}
        sample={lostDialog}
        dealerId={dealerId}
        onSuccess={refresh}
      />
      <MoveBackToSellableDialog
        open={!!displayActionRow}
        onOpenChange={(o) => !o && setDisplayActionRow(null)}
        row={displayActionRow}
        dealerId={dealerId}
        onSuccess={refresh}
      />
    </div>
  );
}
