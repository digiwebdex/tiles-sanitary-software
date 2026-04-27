import VpsDealerManagement from "@/pages/admin/VpsDealerManagement";

const SADealersPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dealers</h1>
        <p className="text-sm text-muted-foreground">
          Approve new sign-ups, suspend or reactivate dealers, and review accounts.
        </p>
      </div>
      <VpsDealerManagement />
    </div>
  );
};

export default SADealersPage;
