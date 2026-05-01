---
name: VPS Migration Phase 3U-13
description: commissionService.ts fully on VPS via /api/commissions/* (sources CRUD, sale commission upsert/remove, list, promote-earned, settle, cancel, dashboard stats)
type: feature
---
Phase 3U-13 — Commission tracking migrated from Supabase to VPS.

Backend: backend/src/routes/commissions.ts mounted at /api/commissions.
- /sources GET/:id/POST/PATCH/DELETE — referral source CRUD (admin writes, all reads). Soft-delete only (FK from sale_commissions).
- /sale/:saleId GET/PUT/DELETE — single commission per sale, upsert allowed for any tenant user (mirrors RLS), delete admin-only via UI.
- GET / — joined list with referral_sources + sales + customers; status/source/date filters.
- POST /:id/promote-earned — idempotent pending→earned promotion, called from delivery flow.
- POST /:id/settle — atomic txn: writes cash_ledger expense + flips to settled. Admin only.
- POST /:id/cancel — admin only, blocks settled.
- GET /dashboard-stats — unpaid liability, payable now, settled this month, top source.

All mutations write audit_logs server-side (ip + ua captured from req).
calculateCommissionAmount helper duplicated server-side so backend never trusts client total.

Frontend: src/services/commissionService.ts rewritten to use vpsAuthedFetch.
All exported signatures preserved — consumers (SaleForm, SaleCommissionPanel, deliveryService, challanService, CommissionReports, ReferralSourcesPage, CommissionDashboardWidgets) unchanged.
