import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import LoginPage from "./pages/auth/LoginPage";
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

// Super Admin
import SuperAdminLayout from "./pages/super-admin/SuperAdminLayout";
import SADashboardPage from "./pages/super-admin/SADashboardPage";
import SADealersPage from "./pages/super-admin/SADealersPage";
import SAPlansPage from "./pages/super-admin/SAPlansPage";
import SASubscriptionsPage from "./pages/super-admin/SASubscriptionsPage";
import SARevenuePage from "./pages/super-admin/SARevenuePage";
import SASystemPage from "./pages/super-admin/SASystemPage";
import SASubscriptionStatusPage from "./pages/super-admin/SASubscriptionStatusPage";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/subscription-blocked" element={<SubscriptionBlockedPage />} />

            {/* Super Admin Panel — role guard inside layout */}
            <Route path="/super-admin" element={<SuperAdminLayout />}>
              <Route index element={<SADashboardPage />} />
              <Route path="dealers" element={<SADealersPage />} />
              <Route path="plans" element={<SAPlansPage />} />
              <Route path="subscriptions" element={<SASubscriptionsPage />} />
              <Route path="subscription-status" element={<SASubscriptionStatusPage />} />
              <Route path="revenue" element={<SARevenuePage />} />
              <Route path="system" element={<SASystemPage />} />
            </Route>

            {/* Dashboard + Reports: allowed in readonly */}
            <Route path="/" element={<ProtectedRoute allowReadonly><AppLayout><Index /></AppLayout></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute allowReadonly><AppLayout><ReportsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/reports/credit" element={<ProtectedRoute allowReadonly><AppLayout><CreditReportPage /></AppLayout></ProtectedRoute>} />

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
            <Route path="/sales-returns" element={<ProtectedRoute><AppLayout><SalesReturnsPage /></AppLayout></ProtectedRoute>} />
            <Route path="/sales-returns/new" element={<ProtectedRoute><AppLayout><CreateSalesReturn /></AppLayout></ProtectedRoute>} />
            <Route path="/ledger" element={<ProtectedRoute><AppLayout><LedgerPage /></AppLayout></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
