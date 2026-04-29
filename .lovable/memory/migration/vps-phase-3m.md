---
name: VPS Migration Phase 3M
description: Sales update + cancel/delete on VPS via PUT/DELETE /api/sales/:id; full atomic restore + recompute + reapply, all in one transaction reusing existing PL/pgSQL RPCs
type: feature
---
# Phase 3M — Sales Update + Cancel on VPS

**Routes**: `PUT /api/sales/:id`, `DELETE /api/sales/:id` (backend/src/routes/sales.ts)

## PUT /api/sales/:id (update)
Single Knex transaction:
1. Restore old stock per item: `restore_sale_batches` RPC (batched portion +
   aggregate + sale_item_batches cleanup), then unbatched remainder via
   direct stock add.
2. Delete old `customer_ledger` + `cash_ledger` entries.
3. Delete old `sale_items`.
4. Update `sales` header (totals, customer, paid, due, profit, etc.).
5. Insert new `sale_items`.
6. Re-deduct stock (FIFO via `allocate_sale_batches` RPC, fallback to
   `deduct_stock_unbatched` for legacy products with no batches).
7. Re-create customer + cash ledger entries with `(edited)` description.
8. Audit log.

## DELETE /api/sales/:id (cancel)
Pre-tx guards (return 400):
- Has delivered challan / delivery_status === 'delivered' → block.
- Existing `deliveries` rows → block.
- `paid_amount > 0` && `sale_status === 'invoiced'` → block (return path
  required instead).

Then atomic transaction:
1. Restore stock per item (batched RPC + unbatched remainder).
2. Delete `backorder_allocations` + defensive `sale_item_batches` cleanup.
3. Delete `customer_ledger` + `cash_ledger` entries.
4. Cancel related `challans` (status → 'cancelled').
5. Delete `sale_items` + `sales` row.
6. Audit log (action: `sale_cancel_delete`).

## RBAC
Both routes restricted to `dealer_admin` and `super_admin`. Salesman is
INSERT-only and cannot reach update/delete (matches Transaction Locking Rules
memory).

## Frontend wiring
`src/services/salesService.update()` and `cancelSale()` short-circuit to VPS
when `AUTH_BACKEND === 'vps'`. Supabase code path retained for fallback.

## Known limitations
- Update path does NOT re-fire backorder allocation if the new item set
  introduces shortages (matches old Supabase behaviour — update never
  honoured backorder mode).
- Update path does NOT preserve old reservations consumed on the original
  sale; reservations are not re-applied on edit.
- Notifications: not re-sent on update or cancel (matches old behaviour).

## Deployment
```bash
cd /var/www/tilessaas && git pull && cd backend && npm install && \
  pm2 restart tileserp-api && cd .. && npm run build
```

## Reads/Writes status after 3M
Sales surface is now FULLY on VPS: list, detail, create, update, cancel.
Supabase fallback paths remain in `salesService` only as safety net for
non-VPS hosts.
