---
name: VPS Migration Phase 3F — Payment Collections
description: Collection tracker outstanding/recent reads on VPS via /api/collections
type: feature
---
**Status:** rewired (awaiting VPS rebuild + restart)

**Backend:** new `backend/src/routes/collections.ts` mounted at `/api/collections`.
- `GET /api/collections/outstanding?dealerId=` — returns CustomerOutstanding[] shape
  (aggregates customers + customer_ledger + sales + customer_followups in one call)
- `GET /api/collections/recent?dealerId=&limit=` — recent payment ledger entries

**Frontend:**
- New `src/services/collectionsService.ts` with USE_VPS gating + Supabase fallback.
- `src/modules/collections/CollectionTracker.tsx` no longer queries Supabase
  directly for outstanding/recent. Payment writes already use the VPS-aware
  `customerLedgerService` + `cashLedgerService` from Phase 3E.

**Deploy on VPS:**
```bash
cd /var/www/tilessaas && git pull && \
  cd backend && npm install && pm2 restart tileserp-api && \
  cd .. && npm run build
```
