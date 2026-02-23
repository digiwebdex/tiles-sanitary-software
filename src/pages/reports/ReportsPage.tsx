import { useAuth } from "@/contexts/AuthContext";
import ReportsPageContent from "@/modules/reports/ReportsPageContent";

const ReportsPage = () => {
  const { profile } = useAuth();
  const dealerId = profile?.dealer_id;

  if (!dealerId) {
    return <div className="p-6"><p className="text-muted-foreground">No dealer assigned.</p></div>;
  }

  return <ReportsPageContent dealerId={dealerId} />;
};

export default ReportsPage;
