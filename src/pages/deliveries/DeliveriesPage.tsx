import { useDealerId } from "@/hooks/useDealerId";
import DeliveryList from "@/modules/deliveries/DeliveryList";

const DeliveriesPage = () => {
  const dealerId = useDealerId();
  return (
    <div className="p-6">
      <DeliveryList dealerId={dealerId} />
    </div>
  );
};

export default DeliveriesPage;
