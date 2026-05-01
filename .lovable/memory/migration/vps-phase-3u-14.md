---
name: VPS Migration Phase 3U-14
description: campaignGiftService + demandPlanningSettingsService on VPS via /api/campaign-gifts and /api/demand-planning-settings; notificationService deferred (edge fn dispatch)
type: feature
---
Phase 3U-14 — Two small services migrated.

Backend:
- /api/campaign-gifts GET/POST/PATCH/DELETE (admin-only writes, joined customer name on list).
- /api/demand-planning-settings GET (open) + PUT/POST reset (admin-only). Server-side validation matches client thresholds (LIMITS + cross-field rules). Uses Postgres ON CONFLICT upsert.

Frontend:
- src/services/campaignGiftService.ts: signatures preserved; update/delete now accept optional `dealerId` (omitted = inferred from req.dealerId on backend). CampaignGiftList wired to pass it.
- src/services/demandPlanningSettingsService.ts: signatures preserved (get/upsert/reset); validation now happens server-side, client just surfaces 400 errors.

Deferred:
- notificationService.ts — calls Supabase edge function `send-notification`. Migrating means reimplementing SMS/email dispatch (BulkSMSBD + Gmail SMTP) on Express, plus moving notification_settings table reads. Keep on Supabase until a dedicated phase.
