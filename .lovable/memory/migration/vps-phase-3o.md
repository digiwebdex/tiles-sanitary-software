---
name: VPS Migration Phase 3O
description: Deliveries + Challans full mutation surface on VPS via /api/deliveries and /api/challans (8 endpoints, atomic txns)
type: feature
---

# Phase 3O — Deliveries + Challans mutations on VPS

## Endpoints
**Deliveries** (`backend/src/routes/deliveries.ts`)
- `POST  /api/deliveries` — create with over-delivery guard, optional batch RPC, sale_status sync, commission promotion
- `PATCH /api/deliveries/:id/status` — update status

**Challans** (`backend/src/routes/challans.ts`)
- `POST  /api/challans` — create + reserve stock
- `POST  /api/challans/:id/deliver` — mark delivered + promote commission
- `POST  /api/challans/convert-invoice/:saleId` — deduct reserved + customer/cash ledger
- `PUT   /api/challans/:id` — update header + optional re-quantify items (unreserve old → re-reserve new + recalc totals)
- `POST  /api/challans/:id/cancel` — unreserve + reset sale to draft
- `PATCH /api/challans/:id/delivery-status` — update delivery_status

All mutations wrap in a single Knex transaction. Stock helpers (`reserveStockTrx`, `unreserveStockTrx`, `deductReservedStockTrx`) mirror the legacy `stockService` aggregate-level logic with `forUpdate()` row locks. Commission promotion is best-effort via `promote_commission_to_earned_if_fully_delivered(sale_id, dealer_id)` PL/pgSQL helper.

## Frontend wiring
- `src/services/deliveryService.ts` — `create` and `updateStatus` short-circuit to VPS when `env.AUTH_BACKEND === 'vps'`. Reads still on Supabase.
- `src/services/challanService.ts` — all 6 mutations short-circuit to VPS. Reads (`list`, `getById`, `getBySaleId`) still on Supabase.

## Auth
- `dealer_admin` or `super_admin` only; `salesman` blocked (matches legacy admin-gated UI).
- super_admin must pass `dealerId` (query or body).

## Out of scope (deferred)
- Reads (list, getById, getDeliveryBatches, getDeliveredQtyBySale) — used elsewhere; mutation-first migration keeps risk low.
- Delivery delete (UI does not expose it).
