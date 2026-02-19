import { useState } from "react";
import { Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard, Store, CreditCard, CalendarPlus, Banknote, Settings, LogOut, Menu, X, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

const sidebarItems = [
  { path: "/super-admin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/super-admin/dealers", label: "Dealers", icon: Store },
  { path: "/super-admin/plans", label: "Plans", icon: CreditCard },
  { path: "/super-admin/subscriptions", label: "Subscriptions", icon: CalendarPlus },
  { path: "/super-admin/revenue", label: "Revenue", icon: Banknote },
  { path: "/super-admin/system", label: "System", icon: Settings },
];

const SuperAdminLayout = () => {
  const { user, profile, isSuperAdmin, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const initials = (profile?.name ?? "SA")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const isActive = (path: string) => {
    if (path === "/super-admin") return location.pathname === "/super-admin";
    return location.pathname.startsWith(path);
  };

  const navTo = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-60 flex-col border-r bg-card fixed inset-y-0 left-0 z-30">
        <div className="flex items-center gap-2 px-5 py-5 border-b">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-bold text-foreground text-sm tracking-tight">Super Admin</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {sidebarItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navTo(item.path)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(item.path)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-4 py-4 border-t">
          <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-card border-r flex flex-col z-50 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-5 py-5 border-b">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-bold text-foreground text-sm">Super Admin</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {sidebarItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navTo(item.path)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive(item.path)
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col lg:ml-60">
        {/* Top header */}
        <header className="sticky top-0 z-20 flex items-center justify-between h-14 px-4 lg:px-6 border-b bg-card">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>

          <div className="hidden lg:block">
            <h2 className="text-sm font-semibold text-foreground">
              {sidebarItems.find((i) => isActive(i.path))?.label ?? "Super Admin"}
            </h2>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-medium text-foreground">
                    {profile?.name ?? "Admin"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{profile?.name}</p>
                  <p className="text-xs text-muted-foreground">{profile?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/")}>
                  Go to ERP
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default SuperAdminLayout;
