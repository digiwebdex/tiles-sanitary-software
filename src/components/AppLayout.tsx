import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Package, ShoppingCart, Receipt, RotateCcw,
  BookOpen, BarChart3, LogOut, Settings, Clock, Truck, Users, ShieldCheck, FileText,
  Undo2, MapPin, Zap, Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, readonlyAllowed: true },
  { path: "/products", label: "Products", icon: Package },
  { path: "/suppliers", label: "Suppliers", icon: Truck },
  { path: "/purchases", label: "Purchases", icon: ShoppingCart },
  { path: "/customers", label: "Customers", icon: Users },
  { path: "/sales", label: "Sales", icon: Receipt },
  { path: "/sales/pos", label: "POS", icon: Zap },
  { path: "/challans", label: "Challans", icon: FileText },
  { path: "/deliveries", label: "Deliveries", icon: MapPin },
  { path: "/sales-returns", label: "Sales Returns", icon: RotateCcw },
  { path: "/purchase-returns", label: "Purchase Returns", icon: Undo2 },
  { path: "/ledger", label: "Ledger", icon: BookOpen },
  { path: "/campaigns", label: "Campaigns", icon: Gift },
  { path: "/reports", label: "Reports", icon: BarChart3, readonlyAllowed: true },
  { path: "/reports/credit", label: "Credit Report", icon: ShieldCheck, readonlyAllowed: true },
];

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { profile, accessLevel, isSuperAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isReadonly = accessLevel === "readonly";
  const isGrace = accessLevel === "grace";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r bg-card p-4 gap-1">
        <h2 className="text-lg font-bold text-foreground mb-4 px-2">ERP</h2>

        {isGrace && (
          <Badge variant="outline" className="mb-3 text-yellow-600 border-yellow-400 justify-center text-xs">
            <Clock className="mr-1 h-3 w-3" /> Grace Period
          </Badge>
        )}
        {isReadonly && (
          <Badge variant="destructive" className="mb-3 justify-center text-xs">
            Read-Only
          </Badge>
        )}

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const disabled = isReadonly && !item.readonlyAllowed;
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => !disabled && navigate(item.path)}
                disabled={disabled}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  disabled && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
          {isSuperAdmin && (
            <button
              onClick={() => navigate("/super-admin")}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Settings className="h-4 w-4" />
              Super Admin
            </button>
          )}
        </nav>

        <div className="mt-auto space-y-2 pt-4 border-t">
          <p className="text-xs text-muted-foreground truncate px-2">{profile?.name}</p>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="flex md:hidden items-center justify-between border-b bg-card px-4 py-3">
          <h2 className="text-lg font-bold text-foreground">ERP</h2>
          <div className="flex items-center gap-2">
            {isGrace && <Badge variant="outline" className="text-yellow-600 border-yellow-400 text-xs"><Clock className="mr-1 h-3 w-3" />Grace</Badge>}
            {isReadonly && <Badge variant="destructive" className="text-xs">Read-Only</Badge>}
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="flex md:hidden overflow-x-auto border-b bg-card px-2 py-1 gap-1">
          {navItems.map((item) => {
            const disabled = isReadonly && !item.readonlyAllowed;
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => !disabled && navigate(item.path)}
                disabled={disabled}
                className={cn(
                  "flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  disabled && "opacity-40 cursor-not-allowed"
                )}
              >
                <item.icon className="h-3 w-3" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

export default AppLayout;
