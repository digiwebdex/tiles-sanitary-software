---
name: VPS Migration Phase 3U-20
description: dashboardService legacy Supabase branch removed; VPS-only via /api/dashboard
type: feature
---
Phase 3U-20: Removed entire dead Supabase fallback path from src/services/dashboardService.ts (435 → 84 lines). All dashboard data including extras (recently sold products, ledger drilldowns, oldest dues) was already aggregated server-side by /api/dashboard on VPS. Frontend now fetches once and merges with SAFE_DEFAULTS — no client-side aggregation, no Supabase calls.

Files: src/services/dashboardService.ts
