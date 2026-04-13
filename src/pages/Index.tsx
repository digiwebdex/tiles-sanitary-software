import { useAuth } from "@/contexts/AuthContext";
import OwnerDashboard from "@/modules/dashboard/OwnerDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Phone, Mail } from "lucide-react";

const Index = () => {
  const { profile, signOut } = useAuth();
  const dealerId = profile?.dealer_id;

  if (!dealerId) {
    return (
      <div className="container mx-auto max-w-lg p-6 mt-12 space-y-4">
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Account Setup Incomplete</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your account hasn't been fully set up yet. A dealer hasn't been assigned to your profile.
              Please contact your administrator to complete the setup.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => window.location.reload()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
              </Button>
              <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={signOut}>
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Need help?</p>
          <p className="text-sm text-muted-foreground">Contact your super admin to assign a dealer to your account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl p-6">
      <OwnerDashboard dealerId={dealerId} />
    </div>
  );
};

export default Index;
