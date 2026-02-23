import { useDealerId } from "@/hooks/useDealerId";
import PurchaseReturnList from "@/modules/purchase-returns/PurchaseReturnList";

const PurchaseReturnsPage = () => {
  const dealerId = useDealerId();
  return (
    <div className="p-6">
      <PurchaseReturnList dealerId={dealerId} />
    </div>
  );
};

export default PurchaseReturnsPage;
