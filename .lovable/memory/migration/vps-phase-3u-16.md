---
name: VPS Migration Phase 3U-16
description: quotationService + whatsappService + demandPlanningService on VPS via /api/quotations, /api/whatsapp, /api/demand-planning; demand aggregation moved server-side
type: feature
---

Phase 3U-16 migrated three services (~1800 LOC) from Supabase to VPS:

**Backend routes added:**
- `backend/src/routes/quotations.ts` — list/get/items/revisions, draft create+update (atomic items replace), finalize (RPC `generate_next_quotation_no`), cancel, delete-draft, revise (RPC), link-to-sale (RPC), conversion-prefill (with blocker checks). Auto-sweep expired on list via `expire_stale_quotations` RPC.
- `backend/src/routes/whatsapp.ts` — log CRUD (create, mark sent/failed, retry clone, bulk status), today-stats, recent (cooldown lookup), 7d analytics, settings GET + upsert (admin-only). Phone normalization mirrors client helper for BD numbers.
- `backend/src/routes/demandPlanning.ts` — moved entire client aggregator server-side: `/rows`, `/project-rows`, `/dashboard-stats`. All product/stock/reserved/shortage/sales/incoming maps loaded in parallel, classified with same rules (stockout/low/reorder/fast/slow/dead) using `demand_planning_settings` table.

**Frontend services rewired:**
- `quotationService.ts` — full vpsAuthedFetch; `_insertItems` kept as no-op stub for signature compat (backend handles items inside create/update transactions).
- `whatsappService.ts` — full vpsAuthedFetch; pure helpers (template builders, phone normalization, `isMessageTypeEnabled`) kept client-side. Enum types now declared locally instead of from Supabase generated types.
- `demandPlanningService.ts` — thin client over VPS endpoints; `groupBy*` and `filter` helpers stay client-side for fast UI re-grouping.

All routes mounted in `backend/src/index.ts` lines 176-178. No Supabase imports remain in any of the three services. All three RPC functions verified present in DB: `expire_stale_quotations`, `generate_next_quotation_no`, `revise_quotation`, `link_quotation_to_sale`.
