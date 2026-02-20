import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { productService } from "@/services/productService";
import Pagination from "@/components/Pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Search, Pencil, AlertTriangle } from "lucide-react";
import { useQuery as useStockQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ProductListProps {
  dealerId: string;
}

const PAGE_SIZE = 25;

const ProductList = ({ dealerId }: ProductListProps) => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["products", dealerId, search, page],
    queryFn: () => productService.list(dealerId, search, page),
    enabled: !!dealerId,
  });

  // Fetch stock levels for low-stock badge
  const { data: stockData } = useStockQuery({
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Products</h1>
        <Button onClick={() => navigate("/products/new")}>
          <Plus className="mr-2 h-4 w-4" /> Add Product
        </Button>
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="capitalize">{p.category}</TableCell>
                    <TableCell>{p.unit_type === "box_sft" ? "Box/SFT" : "Piece"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.default_sale_rate)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <Badge
                          variant={p.active ? "default" : "secondary"}
                          className="cursor-pointer"
                          onClick={() => toggleMutation.mutate({ id: p.id, active: !p.active })}
                        >
                          {p.active ? "Active" : "Inactive"}
                        </Badge>
                        {p.active && (() => {
                          const qty = stockData?.get(p.id) ?? 0;
                          const reorder = p.reorder_level ?? 0;
                          if (qty === 0) return <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />Out of Stock</Badge>;
                          if (reorder > 0 && qty <= reorder) return <Badge variant="destructive" className="text-xs gap-1 bg-destructive/80"><AlertTriangle className="h-3 w-3" />Low Stock</Badge>;
                          return null;
                        })()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/products/${p.id}/edit`)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
};

export default ProductList;
