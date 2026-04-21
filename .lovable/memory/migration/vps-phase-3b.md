---
name: vps-phase-3b
description: Phase 3B — Suppliers UI is now wired to dataClient for reads only. Empty-search list() and getById() flow through the SUPPLIERS adapter, so flipping VITE_DATA_SUPPLIERS=shadow generates real shadow comparisons against the VPS /api/suppliers route. Search list() bypasses the adapter (legacy Supabase OR-ilike preserved) to avoid search-behavior regression. All writes (create/update/toggleStatus) intentionally remain on Supabase — shadow phase is read-verification only.
type: feature
---
## Phase 3B scope

- `src/services/supplierService.ts` rewired:
  - `list(dealerId, "", page)` → `dataClient<Supplier>("SUPPLIERS").list(...)` (shadow-eligible)
  - `list(dealerId, search, page)` → legacy Supabase direct OR-ilike (NOT shadowed)
  - `getById(id)` → resolves dealer scope from profile, then `adapter.getById(id, dealerId)` (shadow-eligible). Falls back to direct Supabase if profile lookup fails (super_admin/edge cases).
  - `create`, `update`, `toggleStatus` → unchanged Supabase direct (intentional: writes are NOT shadowed in 3B).

## Activation

Set in build env (default is `supabase` = no behavior change):
- `VITE_DATA_SUPPLIERS=supabase` → identical to pre-3B behavior.
- `VITE_DATA_SUPPLIERS=shadow`  → real-world shadow rollout. UI shows Supabase result, VPS read mirrored, drift recorded.
- `VITE_DATA_SUPPLIERS=vps`     → full read cutover (DO NOT enable until shadow runs clean for ≥1 day).

## Mismatch logging visibility

While in shadow mode the existing infra captures drift in two places:

1. Browser console — scoped `[data:shadow]` logger emits per mismatch event:
   - `[SUPPLIERS] shadow total mismatch`
   - `[SUPPLIERS] shadow row-count mismatch`
   - `[SUPPLIERS] shadow id-set mismatch`
   - `[SUPPLIERS] shadow getById presence mismatch`
   - `[SUPPLIERS] shadow getById field mismatch`
   - `[SUPPLIERS] shadow list/getById failed` (VPS endpoint error/timeout)
2. Live counter at `window.__vpsShadowStats`:
   `{ reads, mismatches, failures, lastMismatch: { resource, op, detail, at } }`
   Inspect from devtools after browsing the suppliers list to verify parity.

## Tests

- `src/test/suppliersServiceRewire.test.ts` (3 cases):
  1. empty-search list routes through dataClient adapter
  2. search list bypasses adapter and uses legacy OR-ilike
  3. adapter errors propagate (primary read is not silently swallowed)
- Existing `src/test/suppliersShadow.test.ts` (3 cases) and `src/test/dataClient.test.ts` (3 cases) continue to pass unchanged.

## Rollback

One-flag, no code or DB change:
- Unset `VITE_DATA_SUPPLIERS` (or set to `supabase`) and redeploy.
- All supplier reads instantly return to direct Supabase.

## Out of scope (still pending)

- Shadowing the search path (would require backend OR-ilike support).
- Write shadowing — explicitly excluded; 3B is reads only.
- Other resources (Customers / Products / Sales / Quotations / Deliveries / Purchases) still on Supabase only.
