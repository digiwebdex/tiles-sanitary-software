import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supplierService } from "@/services/supplierService";
import SupplierForm from "@/modules/suppliers/SupplierForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EditSupplier = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: supplier, isLoading, error } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => supplierService.getById(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (error || !supplier) {
    navigate("/suppliers");
    return null;
  }

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Edit Supplier — {supplier.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierForm supplier={supplier} />
        </CardContent>
      </Card>
    </div>
  );
};

export default EditSupplier;
