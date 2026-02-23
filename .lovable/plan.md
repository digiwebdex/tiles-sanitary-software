

# Feature Enhancement Plan - 17 Requests Analysis

## Already Implemented (No Changes Needed)

The following features already exist in the system:

- **#9 Client Reference in Memo** -- Already in SaleForm (`client_reference` field)
- **#10 Fitter Reference ID** -- Already in SaleForm (`fitter_reference` field)
- **#12 Ledger System** -- Customer ledger, supplier ledger, and cash ledger all exist
- **#14 Discount with Reference** -- Discount and `discount_reference` fields exist in sale form
- **#6 Customer Refund System** -- Sales return service already handles refunds with ledger entries (both customer and cash ledger)
- **#13 Product Search History** -- Product History report exists in Reports page showing purchase/sale history
- **#17 Challan by Quantity** -- Challan mode already exists with quantity-based delivery tracking
- **#5 Broken Return Option** -- Sales return form already has "Broken/Damaged" toggle that skips restocking

---

## Features to Implement

### 1. Purchase Option from Product Page
Add a "Create Purchase" button/action in the Product list so users can quickly navigate to create a purchase for that product.

**Changes:**
- `src/modules/products/ProductList.tsx` -- Add "Purchase" option in the Actions dropdown menu that navigates to `/purchases/new`
- `src/modules/products/ProductDetailDialog.tsx` -- Add "Purchase" button alongside Edit and Print Barcode

### 2. Separate Box and SFT Totals in Product List
Show warehouse stock with separate Box count and Square Feet totals at the bottom of the product list.

**Changes:**
- `src/modules/products/ProductList.tsx` -- Fetch full stock data (box_qty, sft_qty, piece_qty separately), display per-row box/sft breakdown, and add a summary footer row showing total boxes, total SFT, and total pieces

### 3. Broken Product Stock Adjustment
Add a dedicated "Mark as Broken" option to deduct stock for damaged products without needing a sale return.

**Changes:**
- `src/modules/products/ProductList.tsx` -- Add "Mark Broken" action in dropdown
- Create `src/modules/products/BrokenStockDialog.tsx` -- Dialog to enter broken quantity and reason
- `src/services/stockService.ts` -- Add `deductBrokenStock()` method that deducts stock and logs with "broken" type

### 4. Return Paid Display on Invoice/Memo
Show return and refund information on the sale invoice document.

**Changes:**
- `src/components/sale/SaleInvoiceDocument.tsx` -- Fetch and display any sales returns linked to the sale, showing return qty, refund amount, and net balance after refunds
- `src/pages/sales/InvoicePage.tsx` -- Pass returns data to the invoice component

### 7. Monthly Separate Reports
Add a monthly breakdown report showing sales, payments received, dues, and square feet for each month.

**Changes:**
- `src/modules/reports/ReportsPageContent.tsx` -- Add new "Monthly Summary" report tab
- `src/services/reportService.ts` -- Add `fetchMonthlySummary()` function that aggregates sales, payments (joma), dues (baki), and total SFT by month

### 8. Customer Type Selection in Sale Form
Allow selecting customer type (Retailer/Customer/Project) when creating a sale memo.

**Changes:**
- `src/modules/sales/SaleForm.tsx` -- Add customer type dropdown (retailer/customer/project) near the customer name field. When creating a new customer, use this type. Show existing customer's type when selected.
- `src/modules/sales/saleSchema.ts` -- Add optional `customer_type` field

### 11. Total Box/Piece and SFT on Invoice/Challan
Display total boxes, pieces, and square feet summary on sale invoice and challan documents.

**Changes:**
- `src/components/sale/SaleInvoiceDocument.tsx` -- Add summary row below items table showing "Total: X Box, Y Sft, Z Piece"
- `src/components/challan/ModernChallanDocument.tsx` -- Same summary row addition

### 15. Retailer Campaign Gift Option
Add a gift/campaign system where retailers can receive gifts, tracked as paid through the system.

**Changes:**
- Create new database table `campaign_gifts` with columns: id, dealer_id, customer_id, description, gift_value, payment_status, campaign_name, created_at
- Create `src/services/campaignGiftService.ts` -- CRUD for campaign gifts with ledger integration
- Create `src/modules/campaigns/CampaignGiftForm.tsx` and `CampaignGiftList.tsx`
- Add route and navigation for campaign management

### 16. Monthly Customer/Retailer Product Sales Report with SFT
Show per-customer monthly product sales breakdown including square feet.

**Changes:**
- `src/modules/reports/ReportsPageContent.tsx` -- Enhance "Customers Report" tab to add monthly filter and show SFT breakdown per customer
- `src/services/reportService.ts` -- Update `fetchRetailerSalesReport()` to include month filter and SFT aggregation

---

## Technical Details

### Database Migration (for Feature #15)
```sql
CREATE TABLE public.campaign_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  campaign_name text NOT NULL,
  description text,
  gift_value numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending',
  paid_amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealer admins can manage campaign_gifts"
  ON public.campaign_gifts FOR ALL
  USING (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'))
  WITH CHECK (dealer_id = get_user_dealer_id(auth.uid()) AND has_role(auth.uid(), 'dealer_admin'));

CREATE POLICY "Dealer users can view campaign_gifts"
  ON public.campaign_gifts FOR SELECT
  USING (dealer_id = get_user_dealer_id(auth.uid()));

CREATE POLICY "Super admin full access to campaign_gifts"
  ON public.campaign_gifts FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
```

### Implementation Order
1. Features #1, #2 (Product page enhancements) -- quick wins
2. Feature #3 (Broken stock adjustment)
3. Features #11, #4 (Invoice/challan display improvements)
4. Feature #8 (Customer type in sale form)
5. Features #7, #16 (Report enhancements)
6. Feature #15 (Campaign gift system -- largest new feature)

### Files to Create
- `src/modules/products/BrokenStockDialog.tsx`
- `src/services/campaignGiftService.ts`
- `src/modules/campaigns/CampaignGiftForm.tsx`
- `src/modules/campaigns/CampaignGiftList.tsx`
- `src/pages/campaigns/CampaignsPage.tsx`

### Files to Modify
- `src/modules/products/ProductList.tsx`
- `src/modules/products/ProductDetailDialog.tsx`
- `src/services/stockService.ts`
- `src/components/sale/SaleInvoiceDocument.tsx`
- `src/components/challan/ModernChallanDocument.tsx`
- `src/pages/sales/InvoicePage.tsx`
- `src/modules/sales/SaleForm.tsx`
- `src/modules/sales/saleSchema.ts`
- `src/modules/reports/ReportsPageContent.tsx`
- `src/services/reportService.ts`
- `src/App.tsx` (new routes for campaigns)

