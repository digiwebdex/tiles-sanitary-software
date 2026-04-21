---
name: VPS migration — Phase 3D (Products + Stock + Batches shadow)
description: Backend products/stock/batches REST routes mounted, vpsAdapter + supabaseAdapter resource map extended, productService.list/getById rewired through dataClient. Stock/batches read endpoints exposed for shadow verification only — all stock/batch mutations stay on Supabase RPCs in this phase.
type: feature
---

# Phase 3D — Products + Stock + Batches shadow mode

## Scope (this phase only)

- Products module (catalog) read paths through `dataClient`
- Stock + Batches read endpoints exposed for shadow verification
- All write/RPC paths for products, stock, batches **stay on Supabase**
- No sales / quotations / deliveries / purchases changes

## Files changed

### Backend
- **NEW** `backend/src/routes/products.ts` — full CRUD with `authenticate + tenantGuard`
- **NEW** `backend/src/routes/stock.ts` — read-only (`GET /`, `GET /:id`)
- **NEW** `backend/src/routes/batches.ts` — read-only (`GET /`, `GET /:id`)
- `backend/src/index.ts` — mounted `/api/products`, `/api/stock`, `/api/batches`

### Frontend
- `src/lib/env.ts` — added `STOCK`, `BATCHES` to `DataResource` union
- `src/lib/data/supabaseAdapter.ts` — added STOCK→`stock`, BATCHES→`product_batches` table mapping
- `src/lib/data/vpsAdapter.ts` — added STOCK→`stock`, BATCHES→`batches` route mapping
- `src/services/productService.ts` — `list` (empty-search) + `getById` route through `dataClient<Product>("PRODUCTS")`. Search list + writes stay on Supabase.
- `.env.example` — documented `VITE_DATA_PRODUCTS`, `VITE_DATA_STOCK`, `VITE_DATA_BATCHES` shadow toggles

### Tests
- **NEW** `src/test/productsServiceRewire.test.ts` — verifies adapter routing, legacy search fallback, response-shape preservation, error propagation

## Safety guarantees

- **Tenant guard**: every backend route enforces `authenticate + tenantGuard`. Dealer users are pinned to their `req.dealerId`; super_admin must pass an explicit `dealerId`. Mismatches return 403.
- **Writes**: products / stock / batches mutations remain on Supabase. The product backend has POST/PATCH/DELETE for parity but the frontend never calls them in Phase 3D.
- **Stock/Batches RPCs**: `allocate_sale_batches`, `restore_sale_batches`, `deduct_stock_unbatched`, reserve/unreserve flows untouched — preserves FIFO + shade/caliber/lot null-safe matching + atomic allocation.
- **Search regression**: legacy OR-ilike(sku|name|barcode) search path preserved verbatim; only empty-search list flows through the adapter.

## Rollback

One env flag per resource. Defaults are `supabase`:

```
# Disable shadow / cutover instantly:
VITE_DATA_PRODUCTS=supabase
VITE_DATA_STOCK=supabase
VITE_DATA_BATCHES=supabase
```

Re-deploy with the flag flipped — no code change needed.

## Shadow logging

When `VITE_DATA_PRODUCTS=shadow`:
- Empty-search product list pages fire a parallel VPS read.
- Drift logged via `createLogger("data:shadow")` and counted in
  `window.__vpsShadowStats` ({ reads, mismatches, failures, lastMismatch }).
- VPS read failures (including ROUTE_NOT_IMPLEMENTED) are swallowed —
  primary Supabase result is always returned to the UI.

## Verification

- 14 frontend tests passing (suppliers shadow + suppliers rewire + customers rewire + products rewire + dataClient).
- Backend TypeScript compiles cleanly.
- No write-path behavior changes verified by leaving create/update/toggleActive untouched and asserting them via existing service tests.

## Verdict

Safe for limited production shadow-mode rollout for **products list** reads.
Stock + batches backend routes are deployed as **verification surfaces only**;
no frontend rewire of stock/batch read paths is performed because their
common access pattern (per-product joined reads / per-product RPC) does
not yet have an adapter contract — adding it would be premature scope creep.
