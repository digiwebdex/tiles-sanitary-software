---
name: VPS Migration Phase 3E — Ledger module
description: customer/supplier/cash/expense ledgers and getDueBalance on VPS
type: feature
---
**Status:** rewired (awaiting VPS rebuild + restart)

**Backend:** new `backend/src/routes/ledger.ts` mounted at `/api/ledger`.
- `GET /api/ledger/:kind` — kind ∈ {customers, suppliers, cash, expenses}
- `GET /api/ledger/:kind/monthly-summary?year=`
- `GET /api/ledger/customers/due-balance/:customerId?dealerId=`
- `POST /api/ledger/:kind` — { dealerId, data }
- All scoped by `dealer_id`; super_admin must pass explicit `dealerId`.

**Frontend:**
- `src/services/ledgerService.ts` — all four ledger services USE_VPS gated.
- `src/services/customerService.ts` — `getDueBalance` now uses VPS endpoint.

**Deploy on VPS:**
```bash
cd /var/www/tilessaas && git pull && \
  cd backend && npm install && pm2 restart tileserp-api && \
  cd .. && npm run build
```
