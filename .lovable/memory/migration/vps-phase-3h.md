---
name: VPS Migration Phase 3H
description: Purchases reads (list + detail) on VPS via /api/purchases; mutations still on Supabase
type: feature
---
# Phase 3H — Purchases reads on VPS

**Scope:** read-only first. PurchaseList and Purchase detail/document
viewers now hit `GET /api/purchases` and `GET /api/purchases/:id` when
`AUTH_BACKEND === "vps"`. Create/Update/Delete still run against Supabase
because they involve landed-cost calculation, FIFO batch creation,
supplier ledger sync, backorder allocation and audit logs — those land
in a later phase once read parity is confirmed.

**Backend route** (`backend/src/routes/purchases.ts`):
- `GET /api/purchases?dealerId=&page=&search=` → paginated (PAGE_SIZE 25),
  tenant-scoped, hydrates supplier name.
- `GET /api/purchases/:id` → full purchase + supplier + purchase_items
  joined to products (name/sku/unit_type/per_box_sft).

**Frontend** (`src/services/purchaseService.ts`): `list` and `getById`
now call `vpsRequest` first when on VPS; original Supabase code kept as
the fallback path.

**Deploy:**
```
cd /var/www/tilessaas && git pull && \
  cd backend && npm install && pm2 restart tileserp-api && \
  cd .. && npm run build
```

**Next phases:** 3I Products/Stock reads, then sales/purchases mutations.
