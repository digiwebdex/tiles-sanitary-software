---
name: VPS Migration Phase 3L
description: Sales create on VPS via POST /api/sales; atomic header + items + FIFO batch alloc + reservations + ledger + audit + challan stub in one transaction
type: feature
---
# Phase 3L — Sales Create on VPS

**Route**: `POST /api/sales` (backend/src/routes/sales.ts)

## Atomic transaction covers
1. Find-or-create customer by name (case-insensitive ILIKE).
2. `generate_next_invoice_no(_dealer_id)` RPC for invoice number.
3. Insert `sales` header + `sale_items` rows (preserves index order for duplicate products).
4. For non-challan-mode, per item:
   - FIFO batch allocation honouring customer's own active reservations (treats own holds as available).
   - `allocate_sale_batches(...)` RPC for atomic batch + sale_item_batches + aggregate stock deduction.
   - `deduct_stock_unbatched(...)` RPC for legacy products (no active batches).
   - `consume_reservation_for_sale(...)` RPC for explicit reservation_selections from UI.
5. `customer_ledger` sale entry + `payment` entry if `paid_amount > 0`.
6. `cash_ledger` receipt entry if `paid_amount > 0`.
7. `audit_logs` row keyed to `req.user.userId` with IP + UA.

## Outside transaction
- Auto-creates `challans` stub (challan_no via `generate_next_challan_no` RPC). Failure logged but non-blocking.

## Frontend wiring
- `src/services/salesService.create()` redirects to VPS when `AUTH_BACKEND === 'vps'`.
- Notifications still fire client-side (`notificationService.notifySaleCreated`) using the response payload — single code path for SMS/email templates.

## NOT in scope (deferred to 3M)
- `salesService.update` — restore + recompute, complex.
- `salesService.delete` / cancel — needs reverse-allocation, ledger reversal.
- Both still use Supabase via the original code path.

## RBAC
- super_admin, dealer_admin, salesman (insert-only) all allowed to POST /api/sales.

## Deployment
```bash
cd /var/www/tilessaas && git pull && cd backend && npm install && \
  pm2 restart tileserp-api && cd .. && npm run build
```
