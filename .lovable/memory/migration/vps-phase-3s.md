---
name: VPS Migration Phase 3S
description: Approvals full mutation surface (create/decide/consume/cancel/expire/settings) on VPS via /api/approvals; backorder allocation already covered by 3K/3M/3N
type: feature
---
## Phase 3S — Approvals + Backorder allocations

**Approvals (new):** `backend/src/routes/approvals.ts` exposes:
- `GET  /api/approvals` (filters: status, type)
- `GET  /api/approvals/pending`
- `GET  /api/approvals/settings` / `PUT /api/approvals/settings`
- `POST /api/approvals` (create — auto-approves for admins per dealer setting)
- `POST /api/approvals/:id/decide` → wraps `decide_approval_request` RPC
- `POST /api/approvals/:id/consume` → wraps `consume_approval_request` RPC (hash-validated)
- `POST /api/approvals/:id/cancel` → wraps `cancel_approval_request` RPC
- `POST /api/approvals/expire-stale` → wraps `expire_stale_approvals` RPC

Frontend `src/services/approvalService.ts` routes all 8 functions through `vpsAuthedFetch` when `AUTH_BACKEND === 'vps'`. Supabase fallback retained for legacy hosts.

**Backorder allocations:** No new VPS surface needed — `allocateNewStock` runs inside `POST /api/purchases` (Phase 3K) and `releaseAllocations` runs inside `DELETE /api/sales/:id` + `POST /api/returns/sales` (Phases 3M/3N). All atomic within their parent transaction.

**Note on audit user_id:** RPCs use `auth.uid()` which is null in service-role context — audit rows from VPS will have null user_id, matching the existing edge-function pattern.

**Deploy:**
```bash
cd /var/www/tilessaas && git pull && cd backend && npm install && \
  pm2 restart tilessaas-backend && cd .. && npm run build
```

**Verify:**
1. Trigger a backorder sale (sale below stock) → confirm approval request appears in pending list
2. Admin approves → `decide` succeeds, audit row created
3. Submit the sale again → `consume` succeeds, hash matches
4. Cancel a different pending request → `cancel` succeeds
