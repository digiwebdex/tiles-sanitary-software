import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  listDealerPortalRequests,
  updatePortalRequest,
  type PortalRequest,
  type PortalRequestStatus,
} from "@/services/portalService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const statusVariant = (s: PortalRequestStatus) => {
  if (s === "converted") return "default" as const;
  if (s === "reviewed") return "secondary" as const;
  if (s === "closed") return "outline" as const;
  return "secondary" as const;
};

export default function PortalRequestsAdminPage() {
  const { profile } = useAuth();
  const dealerId = profile?.dealer_id ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<PortalRequest | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "portal_requests", dealerId],
    queryFn: () => listDealerPortalRequests(dealerId),
    enabled: !!dealerId,
  });

  const updateM = useMutation({
    mutationFn: (args: { id: string; status: PortalRequestStatus; note: string }) =>
      updatePortalRequest(args.id, {
        status: args.status,
        review_note: args.note || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "portal_requests", dealerId] });
      toast({ title: "Request updated" });
      setSelected(null);
      setNote("");
    },
    onError: (e) =>
      toast({ variant: "destructive", title: "Failed", description: (e as Error).message }),
  });

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Portal Requests</h1>
        <p className="text-sm text-muted-foreground">
          Reorder and quote requests submitted by portal users.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All requests</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No portal requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="capitalize">{r.request_type}</TableCell>
                      <TableCell>{r.items.length}</TableCell>
                      <TableCell className="max-w-[280px] truncate">
                        {r.message ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelected(r);
                            setNote(r.review_note ?? "");
                          }}
                        >
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review portal request</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {new Date(selected.created_at).toLocaleString()} · {selected.request_type}
              </div>

              {selected.message && (
                <div className="p-2 bg-muted rounded text-sm">{selected.message}</div>
              )}

              <div className="border border-border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.items.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell>{it.product_name}</TableCell>
                        <TableCell className="text-right">{it.quantity}</TableCell>
                        <TableCell>{it.unit_type ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Review note</label>
                <Textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Notes for internal record or to share with customer offline…"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => updateM.mutate({ id: selected!.id, status: "closed", note })}
              disabled={!selected || updateM.isPending}
            >
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => updateM.mutate({ id: selected!.id, status: "reviewed", note })}
              disabled={!selected || updateM.isPending}
            >
              Mark reviewed
            </Button>
            <Button
              onClick={() => updateM.mutate({ id: selected!.id, status: "converted", note })}
              disabled={!selected || updateM.isPending}
            >
              {updateM.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Mark converted
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
