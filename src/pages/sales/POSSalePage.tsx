import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDealerId } from "@/hooks/useDealerId";
import { useAuth } from "@/contexts/AuthContext";
import { salesService } from "@/services/salesService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Minus, Trash2, ShoppingCart } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  product_id: string;
  name: string;
  sku: string;
  unit_type: string;
  per_box_sft: number | null;
  default_sale_rate: number;
  quantity: number;
  sale_rate: number;
}

const POSSalePage = () => {
  const dealerId = useDealerId();
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [processing, setProcessing] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["pos-products", dealerId, search],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, name, sku, unit_type, per_box_sft, default_sale_rate, barcode")
        .eq("dealer_id", dealerId)
        .eq("active", true)
        .order("name")
        .limit(20);
      if (search.trim()) {
        query = query.or(`name.ilike.%${search.trim()}%,sku.ilike.%${search.trim()}%,barcode.ilike.%${search.trim()}%`);
      }
      const { data } = await query;
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["pos-customers", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("dealer_id", dealerId)
        .eq("status", "active")
        .order("name");
      return data ?? [];
    },
  });

  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product_id === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        unit_type: product.unit_type,
        per_box_sft: product.per_box_sft,
        default_sale_rate: Number(product.default_sale_rate),
        quantity: 1,
        sale_rate: Number(product.default_sale_rate),
      }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => c.product_id === productId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c)
        .filter((c) => c.quantity > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const grandTotal = cart.reduce((s, c) => s + c.quantity * c.sale_rate, 0);

  const handleCheckout = async () => {
    if (!customerId) {
      toast({ title: "Please select a customer", variant: "destructive" });
      return;
    }
    if (cart.length === 0) {
      toast({ title: "Cart is empty", variant: "destructive" });
      return;
    }

    const selectedCustomer = customers.find((c) => c.id === customerId);
    if (!selectedCustomer) {
      toast({ title: "Please select a customer", variant: "destructive" });
      return;
    }

    setProcessing(true);
    try {
      await salesService.create({
        dealer_id: dealerId,
        customer_name: selectedCustomer.name,
        sale_date: new Date().toISOString().split("T")[0],
        sale_type: "direct_invoice",
        paid_amount: grandTotal,
        discount: 0,
        discount_reference: "",
        client_reference: "",
        fitter_reference: "",
        payment_mode: paymentMode,
        notes: "POS Sale",
        created_by: user?.id,
        items: cart.map((c) => ({
          product_id: c.product_id,
          quantity: c.quantity,
          sale_rate: c.sale_rate,
        })),
      });
      toast({ title: "Sale completed!" });
      setCart([]);
      setCustomerId("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Product Search */}
      <div className="lg:col-span-2 space-y-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" /> POS Sale
        </h1>

        <Input
          placeholder="Search by name, SKU, or barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {products.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => addToCart(p)}
            >
              <CardContent className="p-3">
                <p className="font-medium text-sm truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                <p className="text-sm font-semibold mt-1">{formatCurrency(p.default_sale_rate)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cart ({cart.length} items)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {cart.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Add products to cart</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableBody>
                    {cart.map((item) => (
                      <TableRow key={item.product_id}>
                        <TableCell className="py-2">
                          <p className="text-sm font-medium truncate max-w-[120px]">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(item.sale_rate)}</p>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(item.product_id, -1)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="text-sm w-6 text-center">{item.quantity}</span>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateQty(item.product_id, 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-right text-sm font-medium">
                          {formatCurrency(item.quantity * item.sale_rate)}
                        </TableCell>
                        <TableCell className="py-2">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeFromCart(item.product_id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-bold">{formatCurrency(grandTotal)}</span>
            </div>

            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="mobile_banking">Mobile Banking</SelectItem>
              </SelectContent>
            </Select>

            <Button className="w-full" onClick={handleCheckout} disabled={processing || cart.length === 0}>
              {processing ? "Processing…" : `Checkout — ${formatCurrency(grandTotal)}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default POSSalePage;
