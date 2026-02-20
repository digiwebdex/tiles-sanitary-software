import PurchaseList from "@/modules/purchases/PurchaseList";
import { useDealerId } from "@/hooks/useDealerId";

const PurchasesPage = () => {
  const dealerId = useDealerId();
  return (
    <div className="container mx-auto max-w-5xl p-6">
      <PurchaseList dealerId={dealerId} />
    </div>
  );
};

export default PurchasesPage;
