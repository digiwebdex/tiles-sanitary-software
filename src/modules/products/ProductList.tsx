import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { productService } from "@/services/productService";
import Pagination from "@/components/Pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Plus, Search, Pencil, AlertTriangle, Barcode, Printer, MoreHorizontal, Eye, Copy, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BarcodePrintDialog from "./BarcodePrintDialog";

interface ProductListProps {
  dealerId: string;
}

const PAGE_SIZE = 25;

const ProductList = ({ dealerId }: ProductListProps) => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [barcodeSingle, setBarcodeSingle] = useState<{ id: string; sku: string; name: string; default_sale_rate: number } | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["products", dealerId, search, page],
    queryFn: () => productService.list(dealerId, search, page),
    enabled: !!dealerId,
  });

  const { data: stockData } = useQuery({
    queryKey: ["products-stock-map", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock")
        .select("product_id, box_qty, piece_qty")
        .eq("dealer_id", dealerId);
      const map = new Map<string, number>();
      for (const s of data ?? []) {
        map.set(s.product_id, (Number(s.box_qty) || 0) + (Number(s.piece_qty) || 0));
      }
      return map;
    },
    enabled: !!dealerId,
  });

  // Fetch average cost for products
  const { data: costData } = useQuery({
    queryKey: ["products-cost-map", dealerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock")
        .select("product_id, average_cost_per_unit")
        .eq("dealer_id", dealerId);
      const map = new Map<string, number>();
      for (const s of data ?? []) {
        map.set(s.product_id, Number(s.average_cost_per_unit) || 0);
      }
      return map;
    },
    enabled: !!dealerId,
  });

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      productService.toggleActive(id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.id)));
    }
  };

  const selectedProducts = products.filter((p) => selected.has(p.id));

  const openBulkBarcode = () => {
    setBarcodeSingle(null);
    setBarcodeOpen(true);
  };

  const openSingleBarcode = (p: typeof products[0]) => {
    setBarcodeSingle({ id: p.id, sku: p.sku, name: p.name, default_sale_rate: p.default_sale_rate });
    setBarcodeOpen(true);
  };

  const handleDuplicate = async (p: typeof products[0]) => {
    try {
      await productService.create({
        dealer_id: dealerId,
        name: `${p.name} (Copy)`,
        sku: `${p.sku}-COPY`,
        category: p.category,
        unit_type: p.unit_type,
        per_box_sft: p.per_box_sft,
        default_sale_rate: p.default_sale_rate,
        reorder_level: p.reorder_level,
        brand: p.brand,
        size: p.size,
        color: p.color,
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product duplicated");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const barcodeProducts = barcodeSingle ? [barcodeSingle] : selectedProducts;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Products</h1>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="outline" onClick={openBulkBarcode}>
              <Printer className="mr-2 h-4 w-4" /> Print Barcodes ({selected.size})
            </Button>
          )}
          <Button onClick={() => navigate("/products/new")}>
            <Plus className="mr-2 h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by SKU or name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-muted-foreground">No products found.</p>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={products.length > 0 && selected.size === products.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Alert Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const qty = stockData?.get(p.id) ?? 0;
                  const cost = costData?.get(p.id) ?? 0;
                  const reorder = p.reorder_level ?? 0;

                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                      <TableCell>
                        <div>
                          <span>{p.name}</span>
                          {p.size && <span className="text-xs text-muted-foreground ml-1">(Size: {p.size})</span>}
                          {p.per_box_sft && <span className="text-xs text-muted-foreground ml-1">(Box: {p.per_box_sft}sft)</span>}
                        </div>
                      </TableCell>
                      <TableCell>{p.brand || "—"}</TableCell>
                      <TableCell className="capitalize">{p.category}</TableCell>
                      <TableCell className="text-right">{formatCurrency(cost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.default_sale_rate)}</TableCell>
                      <TableCell className={`text-right font-medium ${qty < 0 ? "text-destructive" : ""}`}>
                        {qty.toFixed(2)}
                      </TableCell>
                      <TableCell>{p.unit_type === "box_sft" ? "Sft" : "Piece"}</TableCell>
                      <TableCell className="text-right">{reorder > 0 ? reorder : "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 items-center">
                          <Badge
                            variant={p.active ? "default" : "secondary"}
                            className="cursor-pointer text-xs"
                            onClick={() => toggleMutation.mutate({ id: p.id, active: !p.active })}
                          >
                            {p.active ? "Active" : "Inactive"}
                          </Badge>
                          {p.active && qty === 0 && (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <AlertTriangle className="h-3 w-3" />Out
                            </Badge>
                          )}
                          {p.active && reorder > 0 && qty > 0 && qty <= reorder && (
                            <Badge variant="destructive" className="text-xs gap-1 bg-destructive/80">
                              <AlertTriangle className="h-3 w-3" />Low
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8 px-3 text-xs">
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/products/${p.id}/edit`)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit Product
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(p)}>
                              <Copy className="mr-2 h-4 w-4" /> Duplicate Product
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSingleBarcode(p)}>
                              <Barcode className="mr-2 h-4 w-4" /> Print Barcode/Label
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => toggleMutation.mutate({ id: p.id, active: !p.active })}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> {p.active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          )}
        </>
      )}

      <BarcodePrintDialog
        open={barcodeOpen}
        onOpenChange={setBarcodeOpen}
        products={barcodeProducts}
      />
    </div>
  );
};

export default ProductList;
