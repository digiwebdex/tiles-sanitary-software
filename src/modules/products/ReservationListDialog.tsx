import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { listReservations, releaseReservation, type Reservation } from "@/services/reservationService";
import { Lock, Unlock, Clock, CheckCircle } from "lucide-react";

interface ReservationListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  productId?: string;
}

const statusColors: Record<string, string> = {
  active: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  fulfilled: "bg-green-500/20 text-green-400 border-green-500/30",
  released: "bg-muted text-muted-foreground",
  expired: "bg-red-500/20 text-red-400 border-red-500/30",
};

const statusIcons: Record<string, React.ReactNode> = {
  active: <Lock className="h-3 w-3" />,
  fulfilled: <CheckCircle className="h-3 w-3" />,
  released: <Unlock className="h-3 w-3" />,
  expired: <Clock className="h-3 w-3" />,
};

const ReservationListDialog = ({
  open, onOpenChange, dealerId, productId,
}: ReservationListDialogProps) => {
  const queryClient = useQueryClient();
  const [releaseTarget, setReleaseTarget] = useState<Reservation | null>(null);
  const [releaseReason, setReleaseReason] = useState("");

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ["stock-reservations", dealerId, productId],
    queryFn: () => listReservations(dealerId, { product_id: productId }),
    enabled: open,
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      if (!releaseTarget) return;
      if (!releaseReason.trim()) throw new Error("Release reason is required");
      await releaseReservation(releaseTarget.id, dealerId, releaseReason.trim());
    },
    onSuccess: () => {
      toast.success("Reservation released");
      setReleaseTarget(null);
      setReleaseReason("");
      queryClient.invalidateQueries({ queryKey: ["stock-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["products-stock-map"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const formatRemaining = (r: Reservation) => {
    const remaining = Number(r.reserved_qty) - Number(r.fulfilled_qty) - Number(r.released_qty);
    return remaining;
  };

  const formatExpiry = (r: Reservation) => {
    if (!r.expires_at) return "No expiry";
    const d = new Date(r.expires_at);
    const now = new Date();
    const daysLeft = Math.ceil((d.getTime() - now.getTime()) / 86400000);
    if (daysLeft < 0) return "Expired";
    if (daysLeft === 0) return "Today";
    return `${daysLeft}d left`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Stock Reservations
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : reservations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No reservations found</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-xs">Customer</TableHead>
                    <TableHead className="text-xs">Batch</TableHead>
                    <TableHead className="text-xs text-right">Reserved</TableHead>
                    <TableHead className="text-xs text-right">Remaining</TableHead>
                    <TableHead className="text-xs">Expiry</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservations.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="py-2 text-xs">
                        <div className="font-medium">{(r.products as any)?.name ?? "—"}</div>
                        <div className="text-muted-foreground">{(r.products as any)?.sku}</div>
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {(r.customers as any)?.name ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {r.product_batches ? (
                          <div>
                            <div>{(r.product_batches as any)?.batch_no}</div>
                            {(r.product_batches as any)?.shade_code && (
                              <div className="text-muted-foreground">
                                {(r.product_batches as any)?.shade_code}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-right font-semibold">
                        {Number(r.reserved_qty)}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-right font-semibold">
                        {formatRemaining(r)}
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {formatExpiry(r)}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] gap-1 ${statusColors[r.status] ?? ""}`}
                        >
                          {statusIcons[r.status]} {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        {r.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive"
                            onClick={() => setReleaseTarget(r)}
                          >
                            Release
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Release Confirmation */}
      <AlertDialog open={!!releaseTarget} onOpenChange={() => setReleaseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release Reservation</AlertDialogTitle>
            <AlertDialogDescription>
              This will release the remaining held stock back to free stock.
              A reason is required for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              placeholder="Reason for releasing (required)"
              value={releaseReason}
              onChange={(e) => setReleaseReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setReleaseTarget(null); setReleaseReason(""); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => releaseMutation.mutate()}
              disabled={!releaseReason.trim() || releaseMutation.isPending}
              className="bg-destructive text-destructive-foreground"
            >
              {releaseMutation.isPending ? "Releasing…" : "Release Hold"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ReservationListDialog;
