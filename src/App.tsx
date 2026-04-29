import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { getHostEntryRedirect } from "@/lib/hostRouting";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import LoginPage from "./pages/auth/LoginPage";
import LandingPage from "./pages/LandingPage";
import PricingPage from "./pages/public/PricingPage";
import PrivacyPolicyPage from "./pages/public/PrivacyPolicyPage";
import TermsPage from "./pages/public/TermsPage";
import ContactPage from "./pages/public/ContactPage";
import GetStartedPage from "./pages/public/GetStartedPage";
import SubscriptionBlockedPage from "./pages/auth/SubscriptionBlockedPage";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ProductsPage from "./pages/products/ProductsPage";
import CreateProductRoute from "./pages/products/CreateProductRoute";
import EditProduct from "./pages/products/EditProduct";
import PurchasesPage from "./pages/purchases/PurchasesPage";
import CreatePurchase from "./pages/purchases/CreatePurchase";
import ViewPurchase from "./pages/purchases/ViewPurchase";
import SalesPage from "./pages/sales/SalesPage";
import CreateSale from "./pages/sales/CreateSale";
import InvoicePage from "./pages/sales/InvoicePage";
import EditSale from "./pages/sales/EditSale";
import ChallanPage from "./pages/sales/ChallanPage";
import SalesReturnsPage from "./pages/sales-returns/SalesReturnsPage";
import CreateSalesReturn from "./pages/sales-returns/CreateSalesReturn";
import LedgerPage from "./pages/ledger/LedgerPage";
import ReportsPage from "./pages/reports/ReportsPage";
import SuppliersPage from "./pages/suppliers/SuppliersPage";
import CreateSupplier from "./pages/suppliers/CreateSupplier";
import EditSupplier from "./pages/suppliers/EditSupplier";
import CustomersPage from "./pages/customers/CustomersPage";
import CreateCustomer from "./pages/customers/CreateCustomer";
import EditCustomer from "./pages/customers/EditCustomer";
import CreditReportPage from "./pages/reports/CreditReportPage";
import ChallansPage from "./pages/challans/ChallansPage";
import PurchaseReturnsPage from "./pages/purchase-returns/PurchaseReturnsPage";
import CreatePurchaseReturn from "./pages/purchase-returns/CreatePurchaseReturn";
import DeliveriesPage from "./pages/deliveries/DeliveriesPage";
import POSSalePage from "./pages/sales/POSSalePage";
import CampaignsPage from "./pages/campaigns/CampaignsPage";
import CollectionsPage from "./pages/collections/CollectionsPage";
import ApprovalsPage from "./pages/approvals/ApprovalsPage";
import QuotationsPage from "./pages/quotations/QuotationsPage";
import CreateQuotation from "./pages/quotations/CreateQuotation";
import EditQuotation from "./pages/quotations/EditQuotation";
import ProjectsPage from "./pages/projects/ProjectsPage";
import ReferralSourcesPage from "./pages/referrals/ReferralSourcesPage";
import DisplaySampleStockPage from "./pages/display-sample/DisplaySampleStockPage";
import WhatsAppLogsPage from "./pages/whatsapp/WhatsAppLogsPage";
import UserGuidePage from "./pages/UserGuidePage";

// Super Admin
import SuperAdminLayout from "./pages/super-admin/SuperAdminLayout";
import SADashboardPage from "./pages/super-admin/SADashboardPage";
import SADealersPage from "./pages/super-admin/SADealersPage";
import SAPlansPage from "./pages/super-admin/SAPlansPage";
import SASubscriptionsPage from "./pages/super-admin/SASubscriptionsPage";
import SARevenuePage from "./pages/super-admin/SARevenuePage";
import SADealerPaymentsPage from "./pages/super-admin/SADealerPaymentsPage";
import SASystemPage from "./pages/super-admin/SASystemPage";
import SASubscriptionStatusPage from "./pages/super-admin/SASubscriptionStatusPage";
import SACmsPage from "./pages/super-admin/SACmsPage";
import SABackupPage from "./pages/super-admin/SABackupPage";
import SAUserGuidePage from "./pages/super-admin/SAUserGuidePage";
import SettingsPage from "./pages/settings/SettingsPage";
import PricingTiersPage from "./pages/settings/PricingTiersPage";
import PortalUsersPage from "./pages/admin/PortalUsersPage";
import PortalLayout from "./pages/portal/PortalLayout";
import PortalLoginPage from "./pages/portal/PortalLoginPage";
import PortalDashboardPage from "./pages/portal/PortalDashboardPage";
import PortalQuotationsPage from "./pages/portal/PortalQuotationsPage";
import PortalOrdersPage from "./pages/portal/PortalOrdersPage";
import PortalDeliveriesPage from "./pages/portal/PortalDeliveriesPage";
import PortalProjectsPage from "./pages/portal/PortalProjectsPage";
import PortalProjectDetailPage from "./pages/portal/PortalProjectDetailPage";
import PortalLedgerPage from "./pages/portal/PortalLedgerPage";
import PortalAccountPage from "./pages/portal/PortalAccountPage";
import PortalRequestsPage from "./pages/portal/PortalRequestsPage";
import PortalDocumentPage from "./pages/portal/PortalDocumentPage";
import PortalRequestsAdminPage from "./pages/admin/PortalRequestsAdminPage";

const IS_PRODUCTION = import.meta.env.PROD;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: IS_PRODUCTION ? 2 : 0,
      staleTime: 30_000,
    },
    mutations: {
      onError: (error) => {
        if (IS_PRODUCTION) {
          console.error("[MutationError]", error.message);
        } else {
          console.error("[MutationError]", error);
        }
      },
    },
  },
});

/**
 * Bounces "/" to the right entry for the current subdomain.
 *   app.sanitileserp.com/    → /login
 *   portal.sanitileserp.com/ → /portal/login
 * Marketing host keeps "/" as the landing page.
 */
const HostEntryRedirect = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const target = getHostEntryRedirect(location.pathname, window.location.hostname);
    if (target && target !== location.pathname) {
      navigate(target, { replace: true });
    }
  }, [location.pathname, navigate]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <HostEntryRedirect />
          <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/get-started" element={<GetStartedPage />} />
            <Route path="/subscription-blocked" element={<SubscriptionBlockedPage />} />

            {/* Super Admin Panel — role guard inside layout */}
            <Route path="/super-admin" element={<SuperAdminLayout />}>
              <Route index element={<SADashboardPage />} />
              <Route path="dealers" element={<SADealersPage />} />
              <Route path="plans" element={<SAPlansPage />} />
              <Route path="subscriptions" element={<SASubscriptionsPage />} />
              <Route path="subscription-status" element={<SASubscriptionStatusPage />} />
              <Route path="revenue" element={<SARevenuePage />} />
              <Route path="payments" element={<SADealerPaymentsPage />} />
              <Route path="cms" element={<SACmsPage />} />
              <Route path="backups" element={<SABackupPage />} />
              <Route path="user-guide" element={<SAUserGuidePage />} />
              <Route path="system" element={<SASystemPage />} />
            </Route>

            {/* Dashboard + Reports: allowed in readonly */}
            <Route path="/dashboard" element={<ProtectedRoute allowReadonly><AppLayout><Index /></AppLayout></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute allowReadonly><AppLayout><ReportsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/reports/credit" element={<ProtectedRoute allowReadonly><AppLayout><CreditReportPage /></AppLayout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/settings/pricing-tiers" element={<ProtectedRoute><AppLayout><PricingTiersPage /></AppLayout></ProtectedRoute>} />

            {/* Full-access routes */}
            <Route path="/products" element={<ProtectedRoute><AppLayout><ProductsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/products/new" element={<ProtectedRoute><AppLayout><CreateProductRoute /></AppLayout></ProtectedRoute>} />
            <Route path="/products/:id/edit" element={<ProtectedRoute><AppLayout><EditProduct /></AppLayout></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute><AppLayout><SuppliersPage /></AppLayout></ProtectedRoute>} />
            <Route path="/suppliers/new" element={<ProtectedRoute><AppLayout><CreateSupplier /></AppLayout></ProtectedRoute>} />
            <Route path="/suppliers/:id/edit" element={<ProtectedRoute><AppLayout><EditSupplier /></AppLayout></ProtectedRoute>} />
            <Route path="/purchases" element={<ProtectedRoute><AppLayout><PurchasesPage /></AppLayout></ProtectedRoute>} />
            <Route path="/purchases/new" element={<ProtectedRoute><AppLayout><CreatePurchase /></AppLayout></ProtectedRoute>} />
            <Route path="/purchases/:id" element={<ProtectedRoute><AppLayout><ViewPurchase /></AppLayout></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute><AppLayout><CustomersPage /></AppLayout></ProtectedRoute>} />
            <Route path="/customers/new" element={<ProtectedRoute><AppLayout><CreateCustomer /></AppLayout></ProtectedRoute>} />
            <Route path="/customers/:id/edit" element={<ProtectedRoute><AppLayout><EditCustomer /></AppLayout></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute><AppLayout><SalesPage /></AppLayout></ProtectedRoute>} />
            <Route path="/sales/new" element={<ProtectedRoute><AppLayout><CreateSale /></AppLayout></ProtectedRoute>} />
            <Route path="/sales/:id/invoice" element={<ProtectedRoute><AppLayout><InvoicePage /></AppLayout></ProtectedRoute>} />
            <Route path="/sales/:id/edit" element={<ProtectedRoute><AppLayout><EditSale /></AppLayout></ProtectedRoute>} />
            <Route path="/challans/:id" element={<ProtectedRoute><AppLayout><ChallanPage /></AppLayout></ProtectedRoute>} />
            <Route path="/challans" element={<ProtectedRoute><AppLayout><ChallansPage /></AppLayout></ProtectedRoute>} />
            <Route path="/deliveries" element={<ProtectedRoute><AppLayout><DeliveriesPage /></AppLayout></ProtectedRoute>} />
            <Route path="/sales-returns" element={<ProtectedRoute><AppLayout><SalesReturnsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/sales-returns/new" element={<ProtectedRoute><AppLayout><CreateSalesReturn /></AppLayout></ProtectedRoute>} />
            <Route path="/purchase-returns" element={<ProtectedRoute><AppLayout><PurchaseReturnsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/purchase-returns/new" element={<ProtectedRoute><AppLayout><CreatePurchaseReturn /></AppLayout></ProtectedRoute>} />
            <Route path="/sales/pos" element={<ProtectedRoute><POSSalePage /></ProtectedRoute>} />
            <Route path="/ledger" element={<ProtectedRoute><AppLayout><LedgerPage /></AppLayout></ProtectedRoute>} />
            <Route path="/campaigns" element={<ProtectedRoute><AppLayout><CampaignsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/collections" element={<ProtectedRoute><AppLayout><CollectionsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/approvals" element={<ProtectedRoute><AppLayout><ApprovalsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/quotations" element={<ProtectedRoute><AppLayout><QuotationsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/quotations/new" element={<ProtectedRoute><AppLayout><CreateQuotation /></AppLayout></ProtectedRoute>} />
            <Route path="/quotations/:id/edit" element={<ProtectedRoute><AppLayout><EditQuotation /></AppLayout></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><AppLayout><ProjectsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/referrals" element={<ProtectedRoute><AppLayout><ReferralSourcesPage /></AppLayout></ProtectedRoute>} />
            <Route path="/display-sample" element={<ProtectedRoute><AppLayout><DisplaySampleStockPage /></AppLayout></ProtectedRoute>} />
            <Route path="/whatsapp-logs" element={<ProtectedRoute><AppLayout><WhatsAppLogsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/portal-users" element={<ProtectedRoute><AppLayout><PortalUsersPage /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/portal-requests" element={<ProtectedRoute><AppLayout><PortalRequestsAdminPage /></AppLayout></ProtectedRoute>} />

            {/* Customer / Contractor Portal (external users) */}
            <Route path="/portal/login" element={<PortalLoginPage />} />
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<Navigate to="/portal/dashboard" replace />} />
              <Route path="dashboard" element={<PortalDashboardPage />} />
              <Route path="quotations" element={<PortalQuotationsPage />} />
              <Route path="orders" element={<PortalOrdersPage />} />
              <Route path="deliveries" element={<PortalDeliveriesPage />} />
              <Route path="projects" element={<PortalProjectsPage />} />
              <Route path="projects/:id" element={<PortalProjectDetailPage />} />
              <Route path="statement" element={<PortalLedgerPage />} />
              <Route path="requests" element={<PortalRequestsPage />} />
              <Route path="account" element={<PortalAccountPage />} />
              <Route path="quotation/:id" element={<PortalDocumentPage kind="quotation" />} />
              <Route path="invoice/:id" element={<PortalDocumentPage kind="invoice" />} />
              <Route path="challan/:id" element={<PortalDocumentPage kind="challan" />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
