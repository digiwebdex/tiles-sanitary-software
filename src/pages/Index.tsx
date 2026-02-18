import OwnerDashboard from "@/modules/dashboard/OwnerDashboard";

const TEMP_DEALER_ID = "00000000-0000-0000-0000-000000000000";

const Index = () => (
  <div className="container mx-auto max-w-6xl p-6">
    <OwnerDashboard dealerId={TEMP_DEALER_ID} />
  </div>
);

export default Index;
