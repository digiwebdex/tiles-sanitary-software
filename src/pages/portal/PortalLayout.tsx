import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { PortalAuthProvider, usePortalAuth } from "@/contexts/PortalAuthContext";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FileText, ShoppingBag, Truck, Building2, User2, LogOut, Loader2, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const navItems = [
  { to: "/portal/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portal/quotations", label: "My Quotations", icon: FileText },
  { to: "/portal/orders", label: "My Orders", icon: ShoppingBag },
  { to: "/portal/deliveries", label: "My Deliveries", icon: Truck },
  { to: "/portal/projects", label: "My Projects", icon: Building2 },
  { to: "/portal/statement", label: "Statement", icon: Wallet },
  { to: "/portal/account", label: "My Account", icon: User2 },
];

function PortalShell() {
  const { user, context, loading, signOut } = usePortalAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/portal/login" replace />;

  if (!context) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Portal access not available</h1>
          <p className="text-sm text-muted-foreground">
            Your account is not linked to an active portal user, or your access has been revoked.
            Please contact your dealer.
          </p>
          <Button variant="outline" onClick={() => signOut().then(() => navigate("/portal/login"))}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-30">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-primary text-primary-foreground grid place-items-center text-xs font-bold">
              P
            </div>
            <span className="font-semibold tracking-tight">Customer Portal</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => signOut().then(() => navigate("/portal/login"))}
          >
            <LogOut className="h-4 w-4 mr-1.5" /> Sign out
          </Button>
        </div>
        {/* Mobile-friendly nav */}
        <nav className="container mx-auto px-2 overflow-x-auto">
          <ul className="flex gap-1 py-2 min-w-max">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Read-only customer portal · Powered by your dealer
      </footer>
    </div>
  );
}

export default function PortalLayout() {
  return (
    <PortalAuthProvider>
      <PortalShell />
    </PortalAuthProvider>
  );
}

export function PortalListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
