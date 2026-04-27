# Production Data Path — Source of Truth

**Status:** locked as of P0 hardening sprint
**Owner:** platform/architecture

## Decision

The single production data path is **Supabase (Lovable Cloud)**.

The VPS backend (`backend/`) is a parallel target running in **shadow mode only**.
It receives mirrored reads for diff/parity checks and is NOT the authoritative
source for any user-facing transaction in production today.

This document removes the ambiguity flagged in `TilesERP_QA_Audit_v1.md` (C2/C3).

## What this means in code

| Concern | Production path | Notes |
|---|---|---|
| Authentication | **VPS** (`backend/src/routes/auth.ts`) — already migrated in Phase 1 | Issues JWT consumed by both UIs and VPS routes |
| Reads (Customers, Suppliers, Products) | **Supabase primary**, VPS mirror via `dataClient` shadow mode | Diffs logged but never used |
| Writes (all entities) | **Supabase only** | VPS write routes exist but the frontend MUST NOT call them |
| Reports / KPIs / dashboards | **Supabase** | All RLS-protected views remain canonical |
| Backups | **VPS-local + automated script** | Independent of data path; see `docs/BACKUP_RESTORE.md` |

## Hard rules (enforced going forward)

1. **No new feature** may write through `dataClient` with `DATA_BACKENDS[*] = "vps"`
   in production until an explicit migration plan exists for that resource.
2. The default for every `DataResource` in `src/lib/env.ts` MUST stay `"supabase"`.
3. `shadow` mode is allowed and is the only sanctioned way to exercise VPS read
   parity. It must never short-circuit on errors — Supabase's response is the
   one returned to the user.
4. The VPS write routes (`POST/PATCH/DELETE` on `/api/products`, `/api/customers`,
   `/api/suppliers`) are defense-in-depth implementations only. They are now
   gated by `requireRole('dealer_admin')` so an accidental wiring does not
   create a privilege-escalation vector.
5. New backend routes for transactional modules (sales, POS, deliveries, returns,
   ledger, reservations, approvals) are **not in scope**. Building any of them
   requires lifting this lock first.

## Rollback / migration plan (future, not now)

A future "VPS cutover" sprint will:

1. Pick one resource at a time (start with `SUPPLIERS`, then `CUSTOMERS`).
2. Run shadow for ≥ 7 production days with zero diffs.
3. Add per-route `requireRole` + audit-log writes on the VPS path.
4. Flip `DATA_BACKENDS[<resource>]` to `"vps"` in production env.
5. Decommission the matching Supabase write path only after 30 days clean.

Until that plan ships, this file is the source of truth: **Supabase wins**.
