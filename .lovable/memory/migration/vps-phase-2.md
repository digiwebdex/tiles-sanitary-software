---
name: VPS Migration Phase 2
description: Phase 2 only — shared dataClient with supabase/vps/shadow adapters, per-resource env flags. No service migration yet; defaults preserve Supabase behavior.
type: feature
---
# Phase 2 — Shared dataClient + Adapters

## Status
Foundation only. Default flags = "supabase", so production behavior is unchanged. No service or page consumes the dataClient yet — Phase 3 will migrate one resource at a time.

## Files
- `src/lib/env.ts` — adds `DataBackend` type and `DATA_BACKENDS` map
- `src/lib/data/types.ts` — `ResourceAdapter`, `ListQuery`, `ListResult`
- `src/lib/data/supabaseAdapter.ts` — default passthrough
- `src/lib/data/vpsAdapter.ts` — calls `/api/<resource>` via `vpsAuthedFetch`; throws clear `ROUTE_NOT_IMPLEMENTED` until Phase 3 backend lands
- `src/lib/data/shadowAdapter.ts` — supabase primary + parallel vps read for diff logging (read-only, never throws on shadow failure)
- `src/lib/data/dataClient.ts` — `dataClient<T>("CUSTOMERS")` factory with cache
- `src/test/dataClient.test.ts` — verifies flag routing (default / vps / shadow)

## Resources covered
CUSTOMERS, SUPPLIERS, PRODUCTS, SALES, QUOTATIONS, DELIVERIES, PURCHASES

## Env flags (per resource, all default to supabase)
- `VITE_DATA_CUSTOMERS=supabase|vps|shadow`
- `VITE_DATA_SUPPLIERS=...`
- `VITE_DATA_PRODUCTS=...`
- `VITE_DATA_SALES=...`
- `VITE_DATA_QUOTATIONS=...`
- `VITE_DATA_DELIVERIES=...`
- `VITE_DATA_PURCHASES=...`

## Rollback
Unset all `VITE_DATA_*` env vars and rebuild → every adapter falls back to supabase passthrough. No DB / no destructive changes.

## Shadow mode safety
- Writes ALWAYS go to primary (supabase). Shadow never writes.
- Reads return primary immediately; vps read is fire-and-forget.
- Mismatches and vps failures log via `createLogger("data:shadow")` only — never affect UI.
