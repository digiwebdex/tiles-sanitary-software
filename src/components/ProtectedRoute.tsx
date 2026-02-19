import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AccessLevel } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Routes allowed in readonly mode (dashboard, reports) */
  allowReadonly?: boolean;
}

const ProtectedRoute = ({ children, allowReadonly = false }: ProtectedRouteProps) => {
  const { user, loading, accessLevel, profile, isSuperAdmin } = useAuth();
  const location = useLocation();

  // Log expired-subscription access attempts
  useEffect(() => {
    if (
      !loading &&
      user &&
      !isSuperAdmin &&
      (accessLevel === "readonly" || accessLevel === "blocked") &&
      !allowReadonly
    ) {
      supabase
        .from("audit_logs")
        .insert([
          {
            dealer_id: profile?.dealer_id ?? null,
            user_id: user.id,
            action: "EXPIRED_SUBSCRIPTION_ACCESS",
            table_name: "route_guard",
            record_id: location.pathname,
            new_data: {
              access_level: accessLevel,
              path: location.pathname,
              timestamp: new Date().toISOString(),
            } as any,
          },
        ])
        .then(() => {});
    }
  }, [loading, user, accessLevel, allowReadonly, location.pathname, isSuperAdmin]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Super admins always have full access — never redirect them
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Blocked = no subscription at all
  if (accessLevel === "blocked") {
    return <Navigate to="/subscription-blocked" replace />;
  }

  // Read-only mode: only allow readonly-permitted routes
  if (accessLevel === "readonly" && !allowReadonly) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
