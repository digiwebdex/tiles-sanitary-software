---
name: VPS Migration Phase 3G
description: Sales reads (list + detail) on VPS via /api/sales; mutations still on Supabase
type: feature
---
# Phase 3G — Sales reads on VPS

**Scope:** read-only first. The Sales list page and SaleDetail/document
viewers now hit `GET /api/sales` and `GET /api/sales/:id` on the VPS when
`AUTH_BACKEND === "vps"`. Mutations (create/update/delete/cancel) still go
to Supabase because they involve FIFO batch RPCs, ledger sync,
notifications, audit logs and challan auto-creation — these will land in
later phases (3H+) once read parity is confirmed in production.

**Backend route** (`backend/src/routes/sales.ts`):
- `GET /api/sales?dealerId=&page=&search=&projectId=&siteId=` → paginated
  (PAGE_SIZE 25), tenant-scoped, hydrates customers/projects/sites.
- `GET /api/sales/:id` → full sale + customer + sale_items joined to
  products (name/sku/unit_type/per_box_sft) for the invoice document.

**Frontend** (`src/services/salesService.ts`): `list` and `getById` now
call `vpsRequest` first when on VPS; the original Supabase code is kept as
the fallback path for legacy/preview hosts.

**Why split read vs write:** the create/update flow is 600+ lines of
business logic with 7+ Supabase RPCs (`generate_next_invoice_no`,
`generate_next_challan_no`, `consume_reservation_for_sale`, FIFO
allocation, `restore_sale_batches`, etc.). Migrating them in one shot
risks regressing live invoicing for MSE/DBL Brahmanbaria. Reads were
gated separately so dealers immediately benefit on VPS without exposure
to mutation regressions.

**Deploy:**
```
cd /var/www/tilessaas && git pull && \
  cd backend && npm install && pm2 restart tileserp-api && \
  cd .. && npm run build
```

**Next phases:** 3H Purchases (reads), 3I Products/Stock, then sales
mutations.
