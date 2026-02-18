import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/new" element={<CreateProductRoute />} />
          <Route path="/products/:id/edit" element={<EditProduct />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/purchases/new" element={<CreatePurchase />} />
          <Route path="/purchases/:id" element={<ViewPurchase />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/sales/new" element={<CreateSale />} />
          <Route path="/sales/:id/invoice" element={<InvoicePage />} />
          <Route path="/sales-returns" element={<SalesReturnsPage />} />
          <Route path="/sales-returns/new" element={<CreateSalesReturn />} />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
