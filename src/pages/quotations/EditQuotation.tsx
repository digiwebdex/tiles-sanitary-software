import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import QuotationForm from "@/modules/quotations/QuotationForm";
import { quotationService } from "@/services/quotationService";

const EditQuotation = () => {
  const { id } = useParams<{ id: string }>();

  const { data: quotation, isLoading } = useQuery({
    queryKey: ["quotation", id],
    queryFn: () => quotationService.getById(id!),
    enabled: !!id,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["quotation-items", id],
    queryFn: () => quotationService.listItems(id!),
    enabled: !!id,
  });

  if (isLoading || !quotation) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="p-4 lg:p-6">
      <QuotationForm initialQuotation={quotation} initialItems={items} />
    </div>
  );
};

export default EditQuotation;
