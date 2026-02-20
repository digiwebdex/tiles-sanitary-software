import SaleList from "@/modules/sales/SaleList";
import { useDealerId } from "@/hooks/useDealerId";

const SalesPage = () => {
  const dealerId = useDealerId();
  return (
    <div className="container mx-auto max-w-5xl p-6">
      <SaleList dealerId={dealerId} />
    </div>
  );
};

export default SalesPage;
