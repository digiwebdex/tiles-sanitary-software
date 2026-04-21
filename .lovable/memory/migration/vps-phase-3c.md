---
name: VPS Migration — Phase 3C
description: Customers module rewired to dataClient with backend REST routes; shadow-mode eligible via VITE_DATA_CUSTOMERS=shadow
type: feature
---
# Phase 3C — Customers shadow-mode rollout

## Backend
- New `backend/src/routes/customers.ts` mirrors suppliers route exactly.
- Mounted at `/api/customers` in `backend/src/index.ts`.
- Tenant guard mandatory (authenticate + tenantGuard). Dealer users pinned to own dealer_id; super_admin must specify dealerId.
- Whitelisted SORTABLE / FILTERABLE / WRITABLE columns. `opening_balance` immutable after creation.

## Frontend rewire
- `src/services/customerService.ts`:
  - `list()` (empty search) → routes through `dataClient<Customer>("CUSTOMERS")`.
  - `list()` (with search) → legacy Supabase OR-ilike path preserved.
  - `getById()` → adapter path with dealerId resolved from profile; legacy fallback for super_admin.
  - `typeFilter` forwarded as adapter equality filter `{ type: ... }`.
  - All writes (`create`, `update`, `toggleStatus`) stay on Supabase.
  - Public signatures unchanged → no UI/page edits required.

## Rollback
- Single env flag: `VITE_DATA_CUSTOMERS=supabase` (default) reverts everything.

## Tests
- `src/test/customersServiceRewire.test.ts` — 4 tests, all passing.

## Status
Safe for limited production shadow-mode rollout (`VITE_DATA_CUSTOMERS=shadow`).
Customers + Suppliers now both shadow-eligible. No other module migrated.
