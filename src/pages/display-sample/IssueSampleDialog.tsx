import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";
import { sampleIssueService, type SampleRecipientType } from "@/services/displayStockService";

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface Customer {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  onSuccess: () => void;
}

export function IssueSampleDialog({ open, onOpenChange, dealerId, onSuccess }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [recipientType, setRecipientType] = useState<SampleRecipientType>("customer");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      vpsAuthedFetch(
        `/api/products?dealerId=${dealerId}&pageSize=200&f.active=true&orderBy=name&orderDir=asc`,
      ).then((r) => r.json()),
      vpsAuthedFetch(
        `/api/customers?dealerId=${dealerId}&pageSize=200&orderBy=name&orderDir=asc`,
      ).then((r) => r.json()),
    ]).then(([p, c]) => {
      setProducts((p.rows ?? []) as Product[]);
      setCustomers((c.rows ?? []) as Customer[]);
    });
  }, [open, dealerId]);

  const reset = () => {
    setProductId("");
    setQuantity("1");
    setRecipientType("customer");
    setRecipientName("");
    setRecipientPhone("");
    setCustomerId("");
    setExpectedReturn("");
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!productId) return toast.error("Please select a product");
    if (!recipientName.trim()) return toast.error("Recipient name is required");
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Quantity must be positive");

    setSubmitting(true);
    try {
      await sampleIssueService.issueSample({
        dealer_id: dealerId,
        product_id: productId,
        quantity: qty,
        recipient_type: recipientType,
        recipient_name: recipientName,
        recipient_phone: recipientPhone || undefined,
        customer_id: recipientType === "customer" && customerId ? customerId : undefined,
        expected_return_date: expectedReturn || undefined,
        notes: notes || undefined,
      });
      toast.success("Sample issued — sellable stock reduced");
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue sample");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Issue Sample</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Select product…" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label>Recipient Type</Label>
              <Select value={recipientType} onValueChange={(v) => setRecipientType(v as SampleRecipientType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="architect">Architect</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="mason">Mason / Fitter</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {recipientType === "customer" && (
            <div>
              <Label>Link to Customer (optional)</Label>
              <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Recipient Name</Label>
              <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required />
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Expected Return Date (optional)</Label>
            <Input
              type="date"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
            />
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. For bathroom mockup approval"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Issuing…" : "Issue Sample"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
