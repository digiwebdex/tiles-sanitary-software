# Analytics & Metrics — TilesERP

> **Last Updated:** 2026-04-14

Complete reference of all analytics, metrics, KPIs, charts, and report data tracked in the system.

---

## Table of Contents

1. [Owner Dashboard KPIs](#owner-dashboard-kpis)
2. [Dashboard Charts](#dashboard-charts)
3. [Dashboard Alert Indicators](#dashboard-alert-indicators)
4. [Reports Module — 20 Report Views](#reports-module--20-report-views)
5. [Super Admin Analytics](#super-admin-analytics)
6. [Notification Analytics](#notification-analytics)
7. [Audit Trail Analytics](#audit-trail-analytics)
8. [Performance Metrics](#performance-metrics)
9. [Data Sources & Queries](#data-sources--queries)

---

## Owner Dashboard KPIs

### Today's Metrics (Real-time)
| KPI | Source Table | Calculation | Icon |
|---|---|---|---|
| Today's Sales | `sales` | SUM(total_amount) WHERE sale_date = today | 📊 TrendingUp |
| Today's Collection | `sales` | SUM(paid_amount) WHERE sale_date = today | 💰 Banknote |
| Today's Profit | `sales` | SUM(net_profit) WHERE sale_date = today | 📈 TrendingUp |
| Today's SFT Sold | `sales` | SUM(total_sft) WHERE sale_date = today | 📦 Package |

### Monthly Metrics
| KPI | Source Table | Calculation |
|---|---|---|
| Monthly Sales | `sales` | SUM(total_amount) WHERE sale_date IN current month |
| Monthly Collection | `sales` | SUM(paid_amount) WHERE sale_date IN current month |
| Monthly Profit | `sales` | SUM(net_profit) WHERE sale_date IN current month |
| Monthly Purchase | `purchases` | SUM(total_amount) WHERE purchase_date IN current month |

### Financial Summary
| KPI | Source Table | Calculation |
|---|---|---|
| Total Customer Due | `sales` | SUM(due_amount) WHERE due_amount > 0 |
| Total Supplier Payable | `supplier_ledger` | Calculated from ledger balances |
| Cash in Hand | `cash_ledger` | Running balance (receipts - payments) |
| Total Stock Value | `stock` | SUM(box_qty × average_cost_per_unit + piece_qty × average_cost_per_unit) |

### Alert Counters
| Alert | Condition | Color |
|---|---|---|
| Low Stock Items | stock qty ≤ reorder_level | 🔴 Red |
| Overdue Customers | Due > 0 AND overdue_days > max_overdue_days | 🟡 Yellow |
| Credit Exceeded | Outstanding > credit_limit | 🔴 Red |
| Dead Stock | No sales in 90+ days | ⚫ Gray |

---

## Dashboard Charts

### 1. Monthly Sales Trend (Line Chart)
- **Type:** Line chart with area fill
- **X-axis:** Months (Jan–Dec)
- **Y-axis:** Sales amount (৳)
- **Data:** Monthly SUM(total_amount) for current year
- **Color:** `hsl(var(--primary))`

### 2. Category Sales Distribution (Pie Chart)
- **Type:** Pie/donut chart
- **Segments:** Tiles vs Sanitary
- **Data:** SUM(total_amount) grouped by product category
- **Colors:** 6-color palette (HSL based)

### 3. Top 10 Customers (Bar Chart)
- **Type:** Horizontal bar chart
- **Data:** Top 10 customers by total purchase amount
- **Sorting:** Descending by amount
- **Color:** `hsl(var(--primary))`

### 4. Top Product Performance (Bar Chart)
- **Type:** Vertical bar chart
- **Data:** Top products by total sales amount
- **Source:** `sale_items` grouped by product_id

### 5. Payment Status Distribution
- **Type:** Badge/count summary
- **Categories:** Paid / Partial / Unpaid
- **Color coding:** Green / Yellow / Red

### 6. Low Stock Items Table
- **Type:** Data table with alert badges
- **Columns:** Product Name, SKU, Category, Current Qty, Reorder Level
- **Highlight:** Red badge when current ≤ reorder

---

## Dashboard Alert Indicators

| Indicator | Threshold | Visual |
|---|---|---|
| Subscription Expiring | ≤ 7 days remaining | Yellow warning banner |
| Low Stock | qty ≤ reorder_level | Red badge + count |
| Overdue Collections | Past max_overdue_days | Yellow counter |
| Credit Exceeded | outstanding > credit_limit | Red counter |
| Dead Stock | No sale in 90+ days | Gray counter |
| Pending Deliveries | delivery status = 'pending' | Blue counter |
| Pending Challans | challan status = 'pending' | Orange counter |

---

## Reports Module — 20 Report Views

### Navigation Structure
**Desktop:** Collapsible accordion sidebar grouped by category  
**Mobile:** Horizontal scrollable tab bar  

### Sales & Revenue Reports (6)

#### 1. Daily Sales Summary
- **Filters:** Date range picker
- **Data:** Date, total sales, total paid, total due, sale count
- **Export:** Excel ✅
- **Access:** All roles

#### 2. Monthly Sales Report
- **Filters:** Year, Month selectors
- **Data:** Product-wise sales for selected month
- **Columns:** Product, SKU, Qty (Box/Piece), SFT, Amount
- **Export:** Excel ✅
- **Access:** All roles

#### 3. Monthly Summary
- **Filters:** Year selector
- **Data:** Month-by-month sales summary for entire year
- **Columns:** Month, Sale Count, Total Amount, Paid, Due
- **Export:** Excel ✅
- **Access:** All roles

#### 4. Sales Report
- **Filters:** Date range, customer, payment status
- **Data:** Individual sale records with customer details
- **Columns:** Date, Invoice, Customer, Amount, Paid, Due, Status
- **Pagination:** 25 per page
- **Export:** Excel ✅
- **Access:** All roles

#### 5. Sales by Salesman
- **Filters:** Year, Month
- **Data:** Salesman performance comparison
- **Columns:** Salesman Name, Sale Count, Total Amount, Paid, Due, Discount
- **Export:** Excel ✅
- **Access:** All roles

#### 6. Profit Analysis 🔒
- **Filters:** Year, Month
- **Data:** Product-wise profit breakdown
- **Columns:** Product, Qty Sold, Revenue, COGS, Gross Profit, Margin %
- **Profit Calculation:** Weighted avg cost per SFT
- **Color coding:** Green (>20%), Yellow (10-20%), Red (<10%)
- **Export:** Excel ✅
- **Access:** 🔒 dealer_admin only

### Inventory Reports (6)

#### 7. Products Report
- **Filters:** Search (name/SKU/brand), category
- **Data:** Complete product inventory with stock levels
- **Columns:** SKU, Name, Brand, Category, Box Qty, SFT, Piece Qty, Avg Cost, Stock Value, Reorder Level
- **Indicators:** Low stock badge (red)
- **Pagination:** 25 per page
- **Export:** Excel ✅

#### 8. Brands Report
- **Filters:** Search
- **Data:** Stock aggregated by brand
- **Columns:** Brand, Total Products, Total Box Qty, Total SFT, Total Value

#### 9. Inventory Report
- **Filters:** Aging period selector
- **Data:** Inventory aging analysis
- **Columns:** Product, Last Sale Date, Days Since Sale, Current Stock, Value
- **Aging Buckets:** 0-30, 31-60, 61-90, 90+ days
- **Color coding:** Green → Yellow → Orange → Red

#### 10. Low Stock Report
- **Filters:** Category
- **Data:** Products below reorder level
- **Columns:** Product, SKU, Current Qty, Reorder Level, Deficit
- **Sorting:** By deficit (highest first)

#### 11. Stock Movement
- **Filters:** Date range, product
- **Data:** Stock in/out movements
- **Columns:** Date, Product, Type (Purchase/Sale/Return/Adjustment), Qty, Reference

#### 12. Product History
- **Filters:** Product selector
- **Data:** Complete transaction history for a product
- **Columns:** Date, Type, Reference, Qty, Rate, Amount

### Customers & Payments Reports (4)

#### 13. Customers Report
- **Filters:** Search, customer type
- **Data:** Customer-wise sales summary
- **Columns:** Customer, Type, Total Sales, Total Paid, Outstanding, Credit Limit
- **Pagination:** 25 per page

#### 14. Payments Report
- **Filters:** Date range, payment mode
- **Data:** Payment collection records
- **Columns:** Date, Customer, Invoice, Amount, Mode, Status

#### 15. Due Aging Analysis
- **Filters:** None (auto-calculated)
- **Data:** Outstanding dues categorized by age
- **Buckets:** 0-30 days, 31-60 days, 61-90 days, 90+ days
- **Columns:** Customer, Total Due, 0-30d, 31-60d, 61-90d, 90+d
- **Color coding:** Severity increases with age
- **Export:** Excel ✅

#### 16. Supplier Outstanding 🔒
- **Filters:** Search
- **Data:** Supplier-wise outstanding balances
- **Columns:** Supplier, Total Purchase, Total Paid, Outstanding
- **Access:** 🔒 dealer_admin only

### Delivery Reports (2)

#### 17. Pending Deliveries
- **Filters:** None
- **Data:** Undelivered challans/orders
- **Columns:** Challan No, Customer, Sale Date, Items, Status

#### 18. Delivery Status
- **Filters:** Date range, status
- **Data:** All deliveries with status tracking
- **Columns:** Delivery No, Challan, Customer, Date, Status, Receiver

### Purchases & Expenses Reports (2)

#### 19. Purchases Report 🔒
- **Filters:** Date range, supplier
- **Data:** Purchase records
- **Columns:** Date, Supplier, Invoice, Amount, Items
- **Access:** 🔒 dealer_admin only

#### 20. Expenses Report 🔒
- **Filters:** Date range, category
- **Data:** Expense records with category breakdown
- **Columns:** Date, Category, Description, Amount
- **Access:** 🔒 dealer_admin only

---

## Super Admin Analytics

### Platform Dashboard (`/super-admin`)

#### KPI Cards
| Metric | Source | Calculation |
|---|---|---|
| Total Dealers | `dealers` | COUNT(*) |
| Active Subscriptions | `subscriptions` | COUNT(*) WHERE status = 'active' |
| Expired Subscriptions | `subscriptions` | COUNT(*) WHERE status = 'expired' |
| Suspended Accounts | `subscriptions` | COUNT(*) WHERE status = 'suspended' |
| Monthly Revenue | `subscription_payments` | SUM(amount) WHERE month = current |
| YTD Revenue | `subscription_payments` | SUM(amount) WHERE year = current |
| New Dealers (Month) | `dealers` | COUNT(*) WHERE created_at IN current month |

#### Plan Distribution
| Plan | Monthly (BDT) | Yearly (BDT) | Max Users |
|---|---|---|---|
| Starter | 999 | 10,000 | 1 |
| Pro | 2,000 | 20,000 | 2 |
| Business | 3,000 | 30,000 | 5 |

### Revenue Reports (`/super-admin/revenue`)
| Metric | Breakdown |
|---|---|
| Revenue by Plan | Starter / Pro / Business |
| Revenue by Period | Monthly / Quarterly / Yearly |
| Payment Methods | Cash / Bank / Mobile Banking |
| Payment Status | Paid / Partial / Pending |
| Collection Rate | (Paid / Total) × 100% |

### Subscription Status (`/super-admin/subscription-status`)
| Status | Visual | Condition |
|---|---|---|
| Active | 🟢 Green badge | status='active' AND end_date > now |
| Expiring Soon | 🟡 Yellow badge | end_date within 7 days |
| Grace Period | 🟡 Yellow badge | Expired within 3 days |
| Expired | 🔴 Red badge | end_date < now - 3 days |
| Suspended | ⚫ Gray badge | Manual suspension |

### Super Admin Reports (`/super-admin` → Reports tab)
- Platform-wide sales aggregation
- Dealer comparison analytics
- Revenue trend charts
- Subscription churn analysis

---

## Notification Analytics

### Tracked in `notifications` table
| Field | Type | Purpose |
|---|---|---|
| `channel` | text | sms / email |
| `type` | text | sale_notification / daily_summary / registration |
| `status` | text | pending / sent / failed |
| `retry_count` | integer | Retry attempts (max 3) |
| `sent_at` | timestamptz | Delivery timestamp |
| `error_message` | text | Failure reason |
| `dealer_id` | uuid | Which dealer |

### Notification Metrics
| Metric | Formula |
|---|---|
| Delivery Rate | (sent / total) × 100% |
| Failure Rate | (failed / total) × 100% |
| Average Retry Count | AVG(retry_count) WHERE status = 'sent' |
| SMS Count (Monthly) | COUNT(*) WHERE channel = 'sms' AND month = current |
| Email Count (Monthly) | COUNT(*) WHERE channel = 'email' AND month = current |

### Notification Triggers
| Event | SMS | Email | Recipients |
|---|---|---|---|
| New Sale | ✅ (if enabled) | ✅ (if enabled) | Dealer owner |
| Daily Summary | ✅ (if enabled) | ✅ (if enabled) | Dealer owner |
| New Registration | ✅ | ✅ | Dealer + Super Admin |
| Subscription Expiry | ❌ | ✅ | Dealer owner |

---

## Audit Trail Analytics

### Tracked in `audit_logs` table
| Field | Purpose |
|---|---|
| `action` | CREATE, UPDATE, DELETE, SUBSCRIPTION_BYPASS_ATTEMPT |
| `table_name` | Affected table |
| `record_id` | Affected record UUID |
| `old_data` | Previous state (JSONB) |
| `new_data` | New state (JSONB) |
| `user_id` | Who performed the action |
| `dealer_id` | Which dealer |
| `ip_address` | Client IP address |
| `user_agent` | Browser/client info |
| `created_at` | Timestamp |

### Audited Events
- Credit override attempts (with reason)
- Subscription bypass attempts (blocked writes)
- User role changes
- Dealer status changes
- Sensitive data modifications

### Login Analytics (login_attempts table)
| Field | Purpose |
|---|---|
| `email` | Attempted email |
| `ip_address` | Source IP |
| `is_locked` | Account locked flag |
| `locked_until` | Lockout expiry |
| `attempted_at` | Attempt timestamp |

---

## Performance Metrics

### Frontend Build
| Metric | Value |
|---|---|
| Total Bundle Size | ~2,224 KB |
| Gzipped Size | ~596 KB |
| CSS Size | ~95 KB (gzip: ~16 KB) |
| Build Time | ~11 seconds |
| Modules Transformed | ~3,712 |

### Runtime Performance
| Metric | Target | Config |
|---|---|---|
| TanStack Query Stale Time | 30 seconds | `queryClient` default |
| Dealer Info Cache | 5 minutes | `useDealerInfo` hook |
| Query Retry (Production) | 2 retries | `queryClient` default |
| Query Retry (Development) | 0 retries | `queryClient` default |

### Backend Performance
| Metric | Value |
|---|---|
| Health Check Response | < 100ms |
| General Rate Limit | 200 req / 15 min |
| Auth Rate Limit | 20 req / 15 min |
| Max Request Body | 10 MB |
| PM2 Memory Usage | ~17-70 MB |

### Database Performance
| Metric | Value |
|---|---|
| Supabase Query Limit | 1000 rows (default) |
| Report Page Size | 25 rows |
| Indexed Columns | dealer_id, customer_id, product_id, sale_id, supplier_id |
| Unique Constraints | (dealer_id, sku), (dealer_id, product_id), (user_id, role) |

---

## Data Sources & Queries

### Dashboard Query Flow
```
OwnerDashboard.tsx
  └── dashboardService.ts
        ├── fetchTodayMetrics() → sales WHERE sale_date = today
        ├── fetchMonthlyMetrics() → sales WHERE sale_date IN current month
        ├── fetchFinancialSummary() → sales (due) + supplier_ledger + cash_ledger + stock
        ├── fetchAlerts() → stock JOIN products (low stock) + customers (overdue/credit)
        ├── fetchMonthlySalesChart() → sales GROUP BY month
        ├── fetchCategorySales() → sale_items JOIN products GROUP BY category
        ├── fetchTopCustomers() → sales GROUP BY customer_id LIMIT 10
        └── fetchProductPerformance() → sale_items GROUP BY product_id
```

### Reports Query Flow
```
ReportsPageContent.tsx
  └── reportService.ts
        ├── fetchStockReport() → products + stock (paginated)
        ├── fetchBrandStockReport() → products + stock GROUP BY brand
        ├── fetchSalesReport() → sales + customers (paginated, filtered)
        ├── fetchRetailerSalesReport() → customers + sales aggregation
        ├── fetchProductHistory() → sale_items + purchase_items for specific product
        ├── fetchAccountingSummary() → expenses GROUP BY category
        ├── fetchInventoryAgingReport() → products + stock + last sale date
        ├── fetchLowStockReport() → stock WHERE qty <= reorder_level
        └── fetchProductsReport() → products + stock (detailed)
  └── AdditionalReports.tsx
        ├── SalesBySalesmanReport → sales GROUP BY created_by + profiles
        ├── SupplierOutstandingReport → supplier_ledger aggregation
        ├── PendingDeliveryReport → deliveries WHERE status = 'pending'
        ├── DeliveryStatusReport → deliveries + challans + customers
        └── StockMovementReport → sale_items + purchase_items by date
```

### Export Utility
All reports support Excel export via `exportToExcel()` utility:
```typescript
import { exportToExcel } from "@/lib/exportUtils";
exportToExcel(data, columns, "report-filename");
// Generates .xlsx file with formatted headers
```
