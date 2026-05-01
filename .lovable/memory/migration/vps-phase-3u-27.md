---
name: VPS Migration Phase 3U-27
description: stockService + batchService + salesService notification + useDealerInfo final read-path migration; only intentional Supabase fallbacks remain (CMS, audit-log, edge-fn, portal)
type: feature
---

# Phase 3U-27 — Final read-path cleanup

Frontend-only phase. Removed the last incidental Supabase reads from core
service/hook files. No backend changes (all needed VPS endpoints already
existed from prior phases).

## Files migrated → zero Supabase imports

- `src/services/stockService.ts`
  - `getProduct()` → `GET /api/products/:id?dealerId=…`
  - `getAvailableQty()` → `GET /api/stock?f.product_id=…&dealerId=…`
  - Note: `getProduct` signature now takes `(productId, dealerId)`.
    Only consumed internally by `getAvailableQty`/`deductStockWithBackorder`,
    both of which already had `dealerId` in scope. No external callers exist.

- `src/services/batchService.ts`
  - `getActiveBatches()` / `getAllBatches()` → `GET /api/batches?f.product_id=…&f.status=active`
  - `planFIFOAllocation()` reservation overlay → `GET /api/reservations/by-customer-product?customerId=…&productId=…`

- `src/services/salesService.ts`
  - `previewBatchAllocation()` product lookup → parallel `GET /api/products/:id`
  - Post-create notification fire-and-forget block:
    - customer → `GET /api/customers/:id`
    - products → parallel `GET /api/products/:id`
    - dealer → `GET /api/dealers/:id` (returns `{ dealer, users, subscription }` — only `dealer.name` consumed)

- `src/hooks/useDealerInfo.ts`
  - `dealers` select → `GET /api/dealers/:id` (consumes `dealer` field of response)

## Helper added

`fetchProductsByIds(dealerId, ids)` in `salesService.ts` — parallel
`Promise.all` over `GET /api/products/:id`. Used by both `previewBatchAllocation`
and the post-create notification path. No backend bulk-by-ids endpoint exists
yet; if perf becomes a concern, add `GET /api/products?ids=` later.

## Files left on Supabase (intentional)

- `src/hooks/useCmsContent.ts` — public website content, no auth, anon read
- `src/hooks/useSubscriptionGuard.ts` — audit-log fallback insert when a
  blocked write is attempted; orthogonal to data path
- `src/services/notificationService.ts` — invokes `send-notification` edge
  function (Supabase auth session needed to authorize the function)
- `src/services/portalService.ts` — runs in the separate Portal auth
  context; its own migration phase

## Deployment

Frontend-only. **No backend rebuild or PM2 restart required.**

## Verification

```bash
rg -l "from ['\"]@/integrations/supabase/client['\"]" src/services/ src/hooks/
# → 4 files (CMS, subscription-guard, notification, portal) — all intentional
```
