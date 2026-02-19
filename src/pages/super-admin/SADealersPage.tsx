import DealerManagement from "@/pages/admin/DealerManagement";

const SADealersPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dealers</h1>
        <p className="text-sm text-muted-foreground">Manage dealers, assign plans, create admin users, and view details.</p>
      </div>
      <DealerManagement />
    </div>
  );
};

export default SADealersPage;
