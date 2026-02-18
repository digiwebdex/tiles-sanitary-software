import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { productService } from "@/services/productService";
import ProductForm from "@/modules/products/ProductForm";
import type { ProductFormValues } from "@/modules/products/productSchema";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CreateProductPageProps {
  dealerId: string;
}

const CreateProductPage = ({ dealerId }: CreateProductPageProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      await productService.create({
        sku: values.sku,
        name: values.name,
        category: values.category,
        dealer_id: dealerId,
        unit_type: values.unit_type,
        default_sale_rate: values.default_sale_rate,
        reorder_level: values.reorder_level,
        active: values.active,
        brand: values.brand || null,
        size: values.size || null,
        color: values.color || null,
        per_box_sft: values.per_box_sft ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product created");
      navigate("/products");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">New Product</h1>
      </div>
      <ProductForm
        onSubmit={async (v) => { await mutation.mutateAsync(v); }}
        isLoading={mutation.isPending}
      />
    </div>
  );
};

export default CreateProductPage;
