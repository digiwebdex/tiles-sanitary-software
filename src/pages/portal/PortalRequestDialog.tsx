import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  getPortalSaleItems,
  submitPortalRequest,
  type PortalRequestItem,
  type PortalRequestType,
} from "@/services/portalService";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  requestType: PortalRequestType;
  sourceSaleId?: string | null;
  sourceQuotationId?: string | null;
  projectId?: string | null;
  siteId?: string | null;
  prefillFromSale?: boolean;
}

export default function PortalRequestDialog({
  open,
  onOpenChange,
  requestType,
  sourceSaleId,
  sourceQuotationId,
  projectId,
  siteId,
  prefillFromSale,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [items, setItems] = useState<PortalRequestItem[]>([]);
  const [message, setMessage] = useState("");
  const [loadingPrefill, setLoadingPrefill] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage("");
    if (prefillFromSale && sourceSaleId) {
      setLoadingPrefill(true);
      getPortalSaleItems(sourceSaleId)
        .then((rows) => setItems(rows.length ? rows : [emptyItem()]))
        .catch(() => setItems([emptyItem()]))
        .finally(() => setLoadingPrefill(false));
    } else {
      setItems([emptyItem()]);
    }
  }, [open, prefillFromSale, sourceSaleId]);

  const submit = useMutation({
    mutationFn: () =>
      submitPortalRequest({
        request_type: requestType,
        source_sale_id: sourceSaleId ?? null,
        source_quotation_id: sourceQuotationId ?? null,
        project_id: projectId ?? null,
        site_id: siteId ?? null,
        message: message.trim() || null,
        items: items.filter((i) => i.product_name.trim() && Number(i.quantity) > 0),
      }),
    onSuccess: () => {
      toast({ title: "Request submitted", description: "Your dealer will review it shortly." });
      qc.invalidateQueries({ queryKey: ["portal", "requests"] });
      onOpenChange(false);
    },
    onError: (e) =>
      toast({ variant: "destructive", title: "Submit failed", description: (e as Error).message }),
  });

  const valid = items.some((i) => i.product_name.trim() && Number(i.quantity) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {requestType === "reorder" ? "Request Reorder" : "Request Quotation"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {loadingPrefill ? (
            <p className="text-sm text-muted-foreground">Loading items…</p>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Items</Label>
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <Input
                    className="col-span-6 h-9"
                    placeholder="Product name"
                    value={item.product_name}
                    onChange={(e) => updateItem(setItems, idx, { product_name: e.target.value })}
                  />
                  <Input
                    className="col-span-3 h-9"
                    placeholder="Qty"
                    type="number"
                    min="0"
                    step="any"
                    value={item.quantity || ""}
                    onChange={(e) => updateItem(setItems, idx, { quantity: Number(e.target.value) })}
                  />
                  <Input
                    className="col-span-2 h-9"
                    placeholder="Unit"
                    value={item.unit_type ?? ""}
                    onChange={(e) => updateItem(setItems, idx, { unit_type: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="col-span-1 h-9 w-9"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add item
              </Button>
            </div>
          )}

          <div>
            <Label className="text-xs">Message / notes (optional)</Label>
            <Textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Any specific requirements, delivery date, site info…"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            This is a request only. Your dealer will review and prepare a quotation. No order or
            payment will be created automatically.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => submit.mutate()} disabled={!valid || submit.isPending}>
            {submit.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function emptyItem(): PortalRequestItem {
  return { product_name: "", quantity: 0, unit_type: "" };
}

function updateItem(
  setItems: React.Dispatch<React.SetStateAction<PortalRequestItem[]>>,
  idx: number,
  patch: Partial<PortalRequestItem>,
) {
  setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
}
