# Charts & Visualizations Reference — TilesERP

> Complete documentation of all charts, graphs, and visual data components.  
> **Library:** Recharts 2.x | **UI:** shadcn/ui ChartContainer

---

## Table of Contents

1. [Owner Dashboard Charts](#owner-dashboard-charts)
2. [Report Module Visualizations](#report-module-visualizations)
3. [Super Admin Charts](#super-admin-charts)
4. [Chart Configuration](#chart-configuration)
5. [Color Palette](#color-palette)

---

## Owner Dashboard Charts

### 1. Monthly Sales Trend (Line Chart)
- **Component:** `<LineChart>` inside `<ChartContainer>`
- **Location:** `src/modules/dashboard/OwnerDashboard.tsx`
- **X-axis:** Months (Jan–Dec)
- **Y-axis:** Sales Amount (৳)
- **Data Source:** `dashboardService.monthlySalesChart`
- **Query:** `sales` table → GROUP BY month, SUM(total_amount) for current year
- **Config:**
  ```typescript
  const trendChartConfig = {
    amount: { label: "Sales (৳)", color: "hsl(var(--primary))" },
  };
  ```
- **Features:** Tooltip with formatted currency, responsive container

### 2. Daily Sales Bar Chart
- **Component:** `<BarChart>` inside `<ChartContainer>`
- **X-axis:** Days of current month
- **Y-axis:** Sales Amount (৳)
- **Data Source:** `dashboardService` → daily sales aggregation
- **Config:**
  ```typescript
  const barChartConfig = {
    amount: { label: "Sales (৳)", color: "hsl(var(--primary))" },
  };
  ```

### 3. Category Sales Distribution (Pie Chart)
- **Component:** `<PieChart>` with `<Pie>` + `<Cell>` components
- **Segments:** Tiles vs Sanitary (and sub-categories if present)
- **Data Source:** `dashboardService.categorySales`
- **Query:** `sale_items` JOIN `products` → GROUP BY category, SUM(total)
- **Color Palette:**
  ```typescript
  const PIE_COLORS = [
    "hsl(222.2, 47.4%, 11.2%)",  // Dark blue
    "hsl(215.4, 16.3%, 46.9%)",  // Slate
    "hsl(210, 40%, 96.1%)",      // Light blue
    "hsl(0, 84.2%, 60.2%)",      // Red
    "hsl(210, 40%, 70%)",        // Medium blue
    "hsl(180, 30%, 50%)",        // Teal
  ];
  ```
- **Features:** Labels with percentages

### 4. Top 10 Customers (Horizontal Bar Chart)
- **Component:** `<BarChart layout="vertical">` inside `<ChartContainer>`
- **X-axis:** Sales Amount (৳)
- **Y-axis:** Customer Names
- **Data Source:** `dashboardService.topCustomers`
- **Query:** `sales` → GROUP BY customer_id, SUM(total_amount) ORDER BY DESC LIMIT 10
- **Config:**
  ```typescript
  const topCustomerChartConfig = {
    amount: { label: "Sales (৳)", color: "hsl(var(--primary))" },
  };
  ```

### 5. Top Product Performance (Bar Chart)
- **Component:** `<BarChart>` inside `<ChartContainer>`
- **X-axis:** Product Names
- **Y-axis:** Sales Amount (৳)
- **Data Source:** `dashboardService.productPerformance`
- **Query:** `sale_items` → GROUP BY product_id, SUM(total) ORDER BY DESC
- **Config:**
  ```typescript
  const productChartConfig = {
    amount: { label: "Sales (৳)", color: "hsl(var(--primary))" },
  };
  ```

---

## Report Module Visualizations

### Profit Analysis Color Coding
- **Location:** `ReportsPageContent.tsx` → Profit Analysis report
- **Type:** Conditional cell coloring (not chart)
- **Thresholds:**
  | Margin % | Color | Meaning |
  |---|---|---|
  | > 20% | 🟢 Green | Healthy margin |
  | 10-20% | 🟡 Yellow | Moderate margin |
  | < 10% | 🔴 Red | Low margin |

### Due Aging Analysis Color Coding
- **Type:** Conditional row/cell coloring
- **Buckets:**
  | Period | Color | Severity |
  |---|---|---|
  | 0-30 days | 🟢 Green | Normal |
  | 31-60 days | 🟡 Yellow | Warning |
  | 61-90 days | 🟠 Orange | Alert |
  | 90+ days | 🔴 Red | Critical |

### Inventory Aging Color Coding
- **Type:** Conditional badges
- **Thresholds:**
  | Days Since Sale | Badge | Action |
  |---|---|---|
  | 0-30 | Green "Active" | Normal |
  | 31-60 | Yellow "Slow" | Monitor |
  | 61-90 | Orange "Aging" | Discount |
  | 90+ | Red "Dead Stock" | Clear out |

### Low Stock Alert Badges
- **Type:** `<Badge>` component
- **Condition:** stock qty ≤ reorder_level
- **Color:** Red/destructive variant

---

## Super Admin Charts

### 1. Subscription Status Distribution
- **Location:** `SADashboardPage.tsx`
- **Type:** Status badge counts (not chart)
- **Categories:**
  | Status | Badge Color |
  |---|---|
  | Active | Green |
  | Expiring Soon | Yellow |
  | Grace Period | Yellow |
  | Expired | Red/Destructive |
  | Suspended | Gray/Secondary |

### 2. Revenue by Period
- **Location:** `SARevenuePage.tsx`
- **Type:** Summary cards + table
- **Metrics:** Monthly revenue, YTD revenue, by plan, by payment method

### 3. Plan Distribution
- **Location:** `SADashboardPage.tsx`
- **Type:** Count per plan (badge/card format)
- **Data:** `subscriptions` JOIN `subscription_plans` → GROUP BY plan_id

### 4. Subscription Lifecycle Timeline
- **Location:** `SASubscriptionStatusPage.tsx`
- **Type:** Table with visual status indicators
- **Columns:** Dealer, Plan, Status Badge, Start, End, Days Remaining
- **Row styling:** Red background for expired, yellow for grace/expiring

---

## Chart Configuration

### Common Settings
```typescript
// All charts use shadcn/ui ChartContainer
<ChartContainer config={chartConfig} className="h-[300px] w-full">
  <ResponsiveContainer>
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="name" />
      <YAxis />
      <ChartTooltip content={<ChartTooltipContent />} />
      <Bar dataKey="amount" fill="var(--color-amount)" />
    </BarChart>
  </ResponsiveContainer>
</ChartContainer>
```

### Chart Dimensions
| Context | Height | Width |
|---|---|---|
| Dashboard card | 300px | 100% (responsive) |
| Report section | 400px | 100% (responsive) |
| Full-page chart | 500px | 100% (responsive) |

### Tooltip Format
- Currency values: `formatCurrency(value)` → "৳ 1,234.56"
- Percentages: `value.toFixed(1)%`
- Quantities: Integer format

---

## Color Palette

### Primary Chart Color
```css
hsl(var(--primary))  /* Theme primary color */
```

### Pie Chart Colors (6-color palette)
```typescript
[
  "hsl(222.2, 47.4%, 11.2%)",  // #1 Dark navy
  "hsl(215.4, 16.3%, 46.9%)",  // #2 Slate gray
  "hsl(210, 40%, 96.1%)",      // #3 Light blue
  "hsl(0, 84.2%, 60.2%)",      // #4 Coral red
  "hsl(210, 40%, 70%)",        // #5 Medium blue
  "hsl(180, 30%, 50%)",        // #6 Teal
]
```

### Status Colors
| Status | Color Token | Visual |
|---|---|---|
| Active/Success | `bg-green-600` | 🟢 |
| Warning/Grace | `border-yellow-500 bg-yellow-500/10` | 🟡 |
| Error/Expired | `destructive` variant | 🔴 |
| Neutral/Suspended | `secondary` variant | ⚫ |
| Info | `bg-blue-500/10` | 🔵 |

### KPI Card Icons
```typescript
// Dashboard KPI icons from lucide-react
TrendingUp    // Sales/Profit trends
Package       // Products/Stock
AlertTriangle // Low stock alerts
Receipt       // Sales/Invoices
Banknote      // Revenue/Collection
ShoppingCart  // Purchases
Wallet        // Cash in hand
Users         // Customers
CreditCard    // Payments
Clock         // Overdue/Aging
BarChart2     // Analytics
Layers        // Inventory
Truck         // Deliveries
Send          // Notifications
PackageCheck  // Delivered items
```


---

## Data Flow Summary

```
Dashboard Charts:
  OwnerDashboard.tsx
    → dashboardService.ts (TanStack Query)
      → Supabase Client (RLS enforced)
        → PostgreSQL tables

Report Visualizations:
  ReportsPageContent.tsx / AdditionalReports.tsx
    → reportService.ts (TanStack Query, paginated)
      → Supabase Client (RLS enforced)
        → PostgreSQL tables

Super Admin Charts:
  SA*Page.tsx components
    → Direct Supabase queries (super_admin RLS)
      → PostgreSQL tables
```
