---
name: VPS Migration Phase 3K
description: Purchase create mutation on VPS via POST /api/purchases — atomic batch + stock + ledger + backorder allocation in one transaction
type: feature
---
# Phase 3K — Purchase mutations on VPS

## Scope
- **Only `purchaseService.create`** is migrated. Update/delete are deferred (would require reversing batch top-ups, ledger entries, backorder allocations).
- Reads (Phase 3H) unchanged.

## Backend
- New endpoint: `POST /api/purchases` in `backend/src/routes/purchases.ts`.
- Single Knex transaction wraps:
  1. Insert `purchases` header.
  2. Insert `purchase_items` rows.
  3. Per item: find-or-create `product_batches` row (null-safe match on shade/caliber/lot), top-up qty, link `purchase_items.batch_id`.
  4. Aggregate `stock` add + recomputed `average_cost_per_unit` (weighted: SFT for box_sft, qty for piece).
  5. FIFO backorder allocation against pending `sale_items` for that product → updates `allocated_qty`, `backorder_qty`, `fulfillment_status`, inserts `backorder_allocations`, refreshes `sales.has_backorder`.
  6. Insert `supplier_ledger` (negative) + `cash_ledger` (negative) entries.
  7. Insert single `audit_logs` row keyed to authenticated `req.user.userId`, IP + UA captured server-side.
- All `forUpdate()` row locks taken on batches/stock/sale_items to prevent concurrent inflation.
- Roles: dealer_admin or super_admin only (403 for salesman). Salesman never records purchases.

## Frontend
- `src/services/purchaseService.ts`: `create()` now short-circuits to `vpsAuthedFetch('/api/purchases', POST)` when `env.AUTH_BACKEND === "vps"`. Legacy Supabase path retained for non-VPS.

## Why atomic
The legacy client-side flow performed ~10 sequential Supabase calls; a network hiccup mid-flow could leave purchase rows without batch links, stock without ledger entries, or backorder allocations without supplier ledger debits. The VPS path is now ACID.

## Deploy
```
cd /var/www/tilessaas && git pull && \
  cd backend && npm install && pm2 restart tileserp-api && \
  cd .. && npm run build
```

## Verification checklist (post-deploy on test dealer)
- Record a purchase with batch_no — confirm `product_batches` top-up not duplicate.
- Record a purchase without batch_no — confirm AUTO- batch row created.
- Confirm `stock.average_cost_per_unit` recomputes for box_sft and piece products.
- Confirm `supplier_ledger` and `cash_ledger` show one purchase entry each.
- Pre-existing pending backorder for the product → confirm `backorder_allocations` row created and sale_item flips to `ready_for_delivery` / `partially_allocated`.
- `audit_logs` row shows correct `user_id`, IP, UA.

## Next phase
Phase 3L — Sales mutations (FIFO allocation, batches, reservation consumption, invoice numbering, ledger, backorder, notifications). Significantly larger and riskier; should be split further if needed.
