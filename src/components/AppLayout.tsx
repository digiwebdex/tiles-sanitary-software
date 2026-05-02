import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Package, ShoppingCart, Receipt, RotateCcw,
  BookOpen, BarChart3, LogOut, Settings, Clock, Truck, Users, ShieldCheck, FileText,
  Undo2, MapPin, Zap, Gift, Wallet, FileSignature, Folder, HandCoins, MonitorSpeaker,
  MessageCircle, UserCog, Inbox, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDealerId } from "@/hooks/useDealerId";
import { PendingApprovalsBadge } from "@/components/approval/PendingApprovalsBadge";
import SAImpersonationBanner from "@/components/SAImpersonationBanner";
import { DemoBanner } from "@/components/DemoBanner";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard, readonlyAllowed: true },
  { path: "/products", label: "Products", icon: Package },
  { path: "/suppliers", label: "Suppliers", icon: Truck },
  { path: "/purchases", label: "Purchases", icon: ShoppingCart },
  { path: "/customers", label: "Customers", icon: Users },
  { path: "/projects", label: "Projects", icon: Folder },
  { path: "/quotations", label: "Quotations", icon: FileSignature },
  { path: "/sales", label: "Sales", icon: Receipt },
  { path: "/sales/pos", label: "POS", icon: Zap },
  { path: "/challans", label: "Challans", icon: FileText },
  { path: "/deliveries", label: "Deliveries", icon: MapPin },
  { path: "/sales-returns", label: "Sales Returns", icon: RotateCcw },
  { path: "/purchase-returns", label: "Purchase Returns", icon: Undo2 },
  { path: "/ledger", label: "Ledger", icon: BookOpen },
  { path: "/collections", label: "Payments", icon: Wallet },
  { path: "/approvals", label: "Approvals", icon: ShieldCheck },
  { path: "/campaigns", label: "Campaigns", icon: Gift },
  { path: "/referrals", label: "Referrals", icon: HandCoins },
  { path: "/display-sample", label: "Display & Samples", icon: MonitorSpeaker },
  { path: "/reports", label: "Reports", icon: BarChart3, readonlyAllowed: true },
  { path: "/reports/credit", label: "Credit Report", icon: ShieldCheck, readonlyAllowed: true },
  { path: "/whatsapp-logs", label: "WhatsApp Log", icon: MessageCircle },
  { path: "/admin/portal-users", label: "Portal Users", icon: UserCog, dealerAdminOnly: true },
  { path: "/admin/portal-requests", label: "Portal Requests", icon: Inbox, dealerAdminOnly: true },
  { path: "/user-guide", label: "User Guide", icon: HelpCircle, readonlyAllowed: true },
  { path: "/settings", label: "Settings", icon: Settings, readonlyAllowed: false },
];

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { profile, accessLevel, isSuperAdmin, isDealerAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const dealerIdForBadge = profile?.dealer_id ?? "";

  const isReadonly = accessLevel === "readonly";
  const isGrace = accessLevel === "grace";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r bg-card p-4 gap-1">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-lg font-bold text-foreground">ERP</h2>
          {isDealerAdmin && dealerIdForBadge && (
            <PendingApprovalsBadge dealerId={dealerIdForBadge} onClick={() => navigate("/approvals")} />
          )}
        </div>

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
            if ((item as any).dealerAdminOnly && !isDealerAdmin && !isSuperAdmin) return null;
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

        <SAImpersonationBanner />
        <DemoBanner />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

export default AppLayout;
