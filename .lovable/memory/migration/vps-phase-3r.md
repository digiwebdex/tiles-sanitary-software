---
name: VPS Migration Phase 3R
description: Expenses + Stock adjustments + Reservations on VPS via /api/expenses, /api/adjustments, /api/reservations
type: feature
---

Phase 3R completed the migration of three orthogonal mutation surfaces to the VPS backend:

**Expenses** (`backend/src/routes/expenses.ts`)
- `GET  /api/expenses?dealerId=` — list (admin only)
- `POST /api/expenses` — atomic create: inserts `expenses` + `expense_ledger(-amount)` + `cash_ledger(type=expense, -amount)` in one Knex transaction. dealer_admin only.

**Stock adjustments** (`backend/src/routes/adjustments.ts`)
- `POST /api/adjustments/{add|deduct|restore|broken}` — atomic stock update with `forUpdate()` row lock + `audit_logs` insert in same txn. Supports both `box_sft` (recomputes `sft_qty`) and `piece` units. dealer_admin only.

**Reservations** (`backend/src/routes/reservations.ts`)
- Full read surface: list + by-customer-product + by-product
- `POST /api/reservations` → calls `create_stock_reservation(...)` RPC + audit
- `POST /api/reservations/:id/release` → `release_stock_reservation(...)` RPC + audit (admin only)
- `POST /api/reservations/:id/extend` → direct `expires_at` update gated on status='active' + audit (admin only)
- `POST /api/reservations/:id/consume` → `consume_reservation_for_sale(...)` RPC + audit
- `POST /api/reservations/expire-stale` → `expire_stale_reservations(...)` RPC

All RPCs are reused as-is (atomicity guaranteed by PL/pgSQL `SECURITY DEFINER` + `FOR UPDATE`).

**Frontend rewiring**: `expenseService.ts`, `stockService.ts` (manual adjustments only — `reserveStock`/`unreserveStock`/`deductReservedStock` still legacy because they're called from in-process Supabase sales/challan flows), and `reservationService.ts` all gate on `env.AUTH_BACKEND === "vps"` and route through `vpsAuthedFetch`. Supabase fallback retained for legacy hosts.
