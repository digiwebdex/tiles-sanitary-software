import ReportsPageContent from "@/modules/reports/ReportsPageContent";

const TEMP_DEALER_ID = "00000000-0000-0000-0000-000000000000";

const ReportsPage = () => (
  <div className="container mx-auto max-w-7xl p-6">
    <ReportsPageContent dealerId={TEMP_DEALER_ID} />
  </div>
);

export default ReportsPage;
