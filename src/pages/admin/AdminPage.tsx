import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Store, CreditCard, CalendarPlus, Users } from "lucide-react";
import DealerManagement from "./DealerManagement";
import PlanManagement from "./PlanManagement";
import SubscriptionManagement from "./SubscriptionManagement";
import DealerUsersOverview from "./DealerUsersOverview";

const AdminPage = () => {
  const { isSuperAdmin } = useAuth();

  if (!isSuperAdmin) {
    return (
      <div className="container mx-auto max-w-4xl p-6">
        <p className="text-destructive">Access denied. Super admin only.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Super Admin Panel</h1>
      </div>

      <Tabs defaultValue="dealers" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dealers" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Store className="h-4 w-4" />
            <span className="hidden sm:inline">Dealers</span>
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Plans</span>
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <CalendarPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Subscriptions</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dealers"><DealerManagement /></TabsContent>
        <TabsContent value="plans"><PlanManagement /></TabsContent>
        <TabsContent value="subscriptions"><SubscriptionManagement /></TabsContent>
        <TabsContent value="users"><DealerUsersOverview /></TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPage;
