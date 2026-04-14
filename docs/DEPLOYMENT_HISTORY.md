# Deployment History — TilesERP

> Complete deployment log for tserp.digiwebdex.com (VPS: 187.77.144.38)

---

## Server Configuration

| Property | Value |
|---|---|
| VPS Provider | Hostinger |
| Server IP | 187.77.144.38 |
| Domain | tserp.digiwebdex.com |
| SSL | Let's Encrypt (auto-renew) |
| Project Directory | `/var/www/tilessaas` |
| PM2 Process Name | `tilessaas-api` |
| Backend Port | 3003 |
| Database Port | 5440 |
| Database Name | `tileserp` |
| Node.js | v20+ |
| Nginx | Reverse proxy + SPA fallback |

---

## Deployment Log

### Deploy #15 — 2026-04-14 (Latest)
**Scope:** Subscription duration presets + Registration notifications  
**Commit Range:** `a19ffdb..0c36bec`  
**Files Changed:** 10 files, +158 / -124  
**Changed Files:**
- `src/integrations/supabase/types.ts` (auto)
- `src/modules/reports/SuperAdminReports.tsx`
- `src/pages/admin/DealerManagement.tsx` (removed Change Plan)
- `src/pages/admin/SubscriptionManagement.tsx` (duration presets)
- `src/pages/super-admin/SADashboardPage.tsx`
- `src/pages/super-admin/SARevenuePage.tsx`
- `src/pages/super-admin/SASubscriptionStatusPage.tsx`
- `supabase/functions/self-signup/index.ts` (notifications)
- `supabase/functions/send-notification/index.ts`
- `supabase/migrations/20260414035832_*.sql` (FK migration)

**Migration:** `20260414035832` — Repoint subscriptions FK from `plans` → `subscription_plans`  
**Build Output:** `dist/index.html` (1.74 KB), `index-*.css` (95.60 KB), `index-*.js` (2,224.79 KB)  
**Build Time:** 11.13s  
**Health Check:** ✅ `{"status":"ok","database":"connected"}`  
**PM2 Status:** online, restart count 210  

**Deploy Command Used:**
```bash
cd /var/www/tilessaas && git pull && npm install && npm run build && cd backend && npm install && set -a && . .env && set +a && npx knex migrate:latest --knexfile src/db/knexfile.ts && pm2 restart tilessaas-api && pm2 save && sleep 2 && curl -s http://127.0.0.1:3003/api/health
```

---

### Deploy #14 — 2026-04-13
**Scope:** Subscription plans CRUD + Revenue system + Payment recording  
**Key Changes:**
- Plan Management CRUD in Super Admin
- Subscription Payment recording with auto-extension
- Revenue Reports page
- Subscription Status overview with lifecycle indicators
- Yearly discount eligibility

**Result:** ✅ Successful

---

### Deploy #13 — 2026-04-12
**Scope:** SMS + Email notification system  
**Key Changes:**
- BulkSMSBD SMS integration
- Gmail SMTP email integration
- Notification settings per dealer
- send-notification, daily-summary, test-smtp edge functions
- notifications + notification_settings tables

**Result:** ✅ Successful

---

### Deploy #12 — 2026-04-11
**Scope:** Super Admin reports + CMS  
**Key Changes:**
- Platform-wide reports for super admin
- CMS page for website content management
- Contact submissions viewer
- website_content + contact_submissions tables

**Result:** ✅ Successful

---

### Deploy #11 — 2026-04-10
**Scope:** Super Admin panel foundation  
**Key Changes:**
- Super Admin layout with sidebar
- SA Dashboard with platform KPIs
- Dealer management (view, create users, reset passwords)
- Edge functions: create-dealer-user, reset-dealer-password, check-subscription-status

**Result:** ✅ Successful

---

### Deploy #10 — 2026-04-09
**Scope:** Subscription lifecycle + Access control  
**Key Changes:**
- Subscription lifecycle enforcement (Trial → Active → Grace → Expired)
- Access levels (full, grace, readonly, blocked)
- useSubscriptionGuard hook
- RLS write guards with has_active_subscription()
- Subscription blocked page

**Result:** ✅ Successful

---

### Deploy #9 — 2026-04-08
**Scope:** Deliveries + Collections + Campaigns  
**Key Changes:**
- Delivery tracking system
- Collections with follow-ups
- Campaign gift management
- deliveries, delivery_items, customer_followups, campaign_gifts tables

**Result:** ✅ Successful

---

### Deploy #8 — 2026-04-07
**Scope:** Bulk import + Barcode system  
**Key Changes:**
- Excel bulk import for products/customers/suppliers
- Barcode generation (JsBarcode) + print dialog
- Import config mappings

**Result:** ✅ Successful

---

### Deploy #7 — 2026-04-06
**Scope:** Credit system + POS mode  
**Key Changes:**
- Credit limit enforcement on sales
- Credit override with owner approval + audit trail
- POS sale page
- Credit report page
- credit_overrides table

**Result:** ✅ Successful

---

### Deploy #6 — 2026-04-05
**Scope:** Reports module (20 report views)  
**Key Changes:**
- 20 report views across 5 categories
- Dual navigation (accordion sidebar + mobile tabs)
- Role-based report access
- Excel export utility
- Paginated reports (25/page)

**Result:** ✅ Successful

---

### Deploy #5 — 2026-04-04
**Scope:** Challan + Invoice system  
**Key Changes:**
- Challan generation from sales
- Modern challan document (print-ready)
- Sale invoice with barcode
- Auto numbering (invoice_sequences)
- challans table

**Result:** ✅ Successful

---

### Deploy #4 — 2026-04-03
**Scope:** Expense + Ledger system  
**Key Changes:**
- 4 ledger types (customer, supplier, cash, expense)
- Expense management with categories
- Multi-tab ledger page
- 5 ledger tables

**Result:** ✅ Successful

---

### Deploy #3 — 2026-04-02
**Scope:** Returns system  
**Key Changes:**
- Sales returns with stock adjustment
- Purchase returns
- Broken stock tracking
- Refund mode tracking
- 3 return tables

**Result:** ✅ Successful

---

### Deploy #2 — 2026-04-01
**Scope:** Purchase + Sales + Products + Customers + Suppliers  
**Key Changes:**
- Complete purchase module with landed cost
- Sales module with profit calculation
- Product + stock management
- Customer + supplier management
- Auto stock updates on purchase/sale
- All core data tables

**Result:** ✅ Successful

---

### Deploy #1 — 2026-03-20 (Initial)
**Scope:** Foundation deployment  
**Key Changes:**
- Multi-tenant architecture
- Supabase Auth integration
- RBAC (super_admin, dealer_admin, salesman)
- RLS on all tables
- Landing page + public pages
- Express backend + health check
- PostgreSQL database + Knex migrations
- Nginx + PM2 + SSL configuration
- Initial schema (001_initial_schema.ts — 30+ tables)

**Initial Setup Commands:**
```bash
# Clone repo
cd /var/www && git clone https://github.com/digiwebdex/tiles-sanitary-software.git tilessaas
cd tilessaas

# Frontend
npm install && npm run build

# Backend
cd backend && npm install
cp .env.example .env  # Edit with production values
set -a && . .env && set +a
npx knex migrate:latest --knexfile src/db/knexfile.ts
npx knex seed:run --knexfile src/db/knexfile.ts

# PM2
pm2 start dist/index.js --name tilessaas-api
pm2 save && pm2 startup

# Nginx
sudo cp nginx/tserp.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/tserp.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL
sudo certbot --nginx -d tserp.digiwebdex.com
```

**Result:** ✅ Successful

---

## Deployment Statistics

| Metric | Value |
|---|---|
| Total Deployments | 15 |
| Successful | 15 (100%) |
| Failed | 0 |
| Average Deploy Time | ~2 minutes |
| Database Migrations | 2 (Supabase Cloud) + 1 (Knex initial) |
| Total PM2 Restarts | 210+ |
