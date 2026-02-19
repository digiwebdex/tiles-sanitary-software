import SupplierForm from "@/modules/suppliers/SupplierForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CreateSupplier = () => (
  <div className="p-4 lg:p-6 max-w-2xl mx-auto">
    <Card>
      <CardHeader>
        <CardTitle>Add Supplier</CardTitle>
      </CardHeader>
      <CardContent>
        <SupplierForm />
      </CardContent>
    </Card>
  </div>
);

export default CreateSupplier;
