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
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { listReservations, releaseReservation, extendReservation, type Reservation } from "@/services/reservationService";
import { usePermissions } from "@/hooks/usePermissions";
import { Lock, Unlock, Clock, CheckCircle, CalendarPlus, FileText } from "lucide-react";

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
  const permissions = usePermissions();
  const [releaseTarget, setReleaseTarget] = useState<Reservation | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [extendTarget, setExtendTarget] = useState<Reservation | null>(null);
  const [extendDate, setExtendDate] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ["stock-reservations", dealerId, productId, statusFilter],
    queryFn: () => listReservations(dealerId, {
      product_id: productId,
      status: statusFilter === "all" ? undefined : statusFilter,
    }),
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

  const extendMutation = useMutation({
    mutationFn: async () => {
      if (!extendTarget || !extendDate || !extendReason.trim()) throw new Error("Date and reason required");
      await extendReservation(extendTarget.id, dealerId, new Date(extendDate).toISOString(), extendReason.trim());
    },
    onSuccess: () => {
      toast.success("Reservation expiry extended");
      setExtendTarget(null);
      setExtendDate("");
      setExtendReason("");
      queryClient.invalidateQueries({ queryKey: ["stock-reservations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const formatRemaining = (r: Reservation) => {
    return Number(r.reserved_qty) - Number(r.fulfilled_qty) - Number(r.released_qty);
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

  const canManage = permissions.isDealerAdmin || permissions.isSuperAdmin;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Stock Reservations
            </DialogTitle>
          </DialogHeader>

          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {["all", "active", "fulfilled", "released", "expired"].map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs capitalize"
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </Button>
            ))}
          </div>

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
                    <TableHead className="text-xs">Details</TableHead>
                    <TableHead className="text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservations.map((r) => {
                    const remaining = formatRemaining(r);
                    return (
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
                          {remaining}
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
                        <TableCell className="py-2 text-xs">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <FileText className="h-3 w-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 text-xs space-y-1.5">
                              <p><span className="text-muted-foreground">Reason:</span> {r.reason || "—"}</p>
                              {r.release_reason && (
                                <p><span className="text-muted-foreground">Release Reason:</span> {r.release_reason}</p>
                              )}
                              <p><span className="text-muted-foreground">Fulfilled:</span> {Number(r.fulfilled_qty)}</p>
                              <p><span className="text-muted-foreground">Released:</span> {Number(r.released_qty)}</p>
                              <p><span className="text-muted-foreground">Created:</span> {new Date(r.created_at).toLocaleString()}</p>
                              {r.source_type !== "manual" && r.source_type && (
                                <p><span className="text-muted-foreground">Source:</span> {r.source_type}</p>
                              )}
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                        <TableCell className="py-2">
                          {r.status === "active" && canManage && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setExtendTarget(r);
                                  setExtendDate(r.expires_at ? new Date(r.expires_at).toISOString().split("T")[0] : "");
                                }}
                              >
                                <CalendarPlus className="h-3 w-3 mr-1" /> Extend
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive"
                                onClick={() => setReleaseTarget(r)}
                              >
                                Release
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

      {/* Extend Expiry Dialog */}
      <AlertDialog open={!!extendTarget} onOpenChange={() => setExtendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Extend Reservation Expiry</AlertDialogTitle>
            <AlertDialogDescription>
              Set a new expiry date for this reservation. Only active reservations can be extended.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">New Expiry Date</Label>
              <Input
                type="date"
                value={extendDate}
                onChange={(e) => setExtendDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div>
              <Label className="text-xs">Reason for Extension</Label>
              <Input
                placeholder="Reason (required for audit)"
                value={extendReason}
                onChange={(e) => setExtendReason(e.target.value)}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setExtendTarget(null); setExtendDate(""); setExtendReason(""); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => extendMutation.mutate()}
              disabled={!extendDate || !extendReason.trim() || extendMutation.isPending}
            >
              {extendMutation.isPending ? "Extending…" : "Extend Expiry"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ReservationListDialog;
