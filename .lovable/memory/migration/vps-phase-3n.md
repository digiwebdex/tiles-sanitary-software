---
name: VPS Migration Phase 3N
description: Returns mutations (sales-returns + purchase-returns create) on VPS via /api/returns/*
type: feature
---

# Phase 3N — Returns mutations on VPS

## Scope
Sales returns and purchase returns **create** moved from Supabase to the VPS
backend in a single atomic Knex transaction each. Update/delete are out of
scope (returns are append-only in the current UI).

## Endpoints
- `POST /api/returns/purchases` — create purchase return
- `GET  /api/returns/purchases/next-no?dealerId=` — sequential PR-XXXX number
- `POST /api/returns/sales` — create sales return

All routes require `dealer_admin` or `super_admin`. Salesman is blocked.

## Atomic side-effects (purchase return)
1. Insert `purchase_returns` header + `purchase_return_items`
2. Deduct aggregate `stock` per product (box_sft → box_qty/sft_qty, piece → piece_qty)
3. Supplier ledger refund (+amount → reduces our payable)
4. Cash ledger refund (+amount inflow)
5. Audit log with IP + UA

## Atomic side-effects (sales return)
1. Pre-tx validations: sale exists in dealer, refund ≤ sale total, qty + already-returned ≤ sold qty
2. Insert `sales_returns` header
3. If `!is_broken`: restore aggregate stock (batch-level restore intentionally NOT done — mirrors legacy Supabase service)
4. If sale_item still tracked backorder: delete its `backorder_allocations`, recompute backorder/allocated/status, refresh `sales.has_backorder`
5. Customer ledger refund (-refund_amount)
6. Cash ledger refund (-refund_amount) only if refund_amount > 0
7. Audit log with IP + UA

## Frontend rewiring
- `src/services/purchaseReturnService.ts`: `create()` and `getNextReturnNo()` route to VPS when `AUTH_BACKEND=vps`
- `src/services/salesReturnService.ts`: `create()` routes to VPS when `AUTH_BACKEND=vps`
- `list()` / `getById()` / `getSaleItems()` still on Supabase (read-only, deferred)

## Backend wiring
- New file: `backend/src/routes/returns.ts`
- Registered: `app.use('/api/returns', returnsRoutes)` in `backend/src/index.ts`

## Deployment
```
cd /var/www/tilessaas && git pull && cd backend && npm install && \
  pm2 restart tileserp-api && cd .. && npm run build
```

## Verification
- Record a purchase return → confirm stock deducted + supplier ledger -payable + cash ledger inflow
- Record a sales return (not broken) → confirm stock restored + customer/cash ledger refund + backorder cleanup if applicable
- Record a broken sales return → confirm stock NOT restored, ledgers still posted
