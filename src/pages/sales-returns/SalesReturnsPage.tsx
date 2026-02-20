import SalesReturnList from "@/modules/sales-returns/SalesReturnList";
import { useDealerId } from "@/hooks/useDealerId";

const SalesReturnsPage = () => {
  const dealerId = useDealerId();
  return (
    <div className="container mx-auto max-w-5xl p-6">
      <SalesReturnList dealerId={dealerId} />
    </div>
  );
};

export default SalesReturnsPage;
