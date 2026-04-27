# TilesERP — Staging UAT Harness

Automated coverage for the highest-risk UAT items:

- **Section C** — Permission leak hunt (C1–C11): cost_price stripping, salesman write/delete denial, cross-tenant reads/writes, unauthenticated reject, forged audit dealer_id, admin-only routes.
- **Section D4** — Parallel invoice number race: fires N concurrent invoice-no requests and asserts 100% uniqueness.

Sections A, B, the rest of D, E, and F remain in the manual checklist (`/mnt/documents/TilesERP_UAT_Checklist_v2.md`).

## Safety guarantees

- **No backups, no restores** — those endpoints are never called.
- **No destructive writes** — only the minimum needed for D4 (sequence generation).
- All forge / cross-tenant write attempts use clearly-prefixed test data (`UAT-LEAK-*`, `UAT-CROSSTENANT-*`) and are expected to be **rejected** by the server. If they are accepted, the harness fails and you have a bug to fix.
- Run **only against staging** or a non-production restored clone. Never run with production JWTs.

## Required env vars

| Var | Purpose |
|---|---|
| `STAGING_BASE_URL` | e.g. `https://api.staging.sanitileserp.com` (no trailing slash) |
| `JWT_SUPER_ADMIN` | super_admin access token |
| `JWT_DEALER_ADMIN` | dealer_admin access token (Dealer A) |
| `JWT_SALESMAN` | salesman access token (Dealer A) |
| `OTHER_DEALER_ID` | a dealer_id NOT belonging to Dealer A |

## Optional env vars

| Var | Purpose |
|---|---|
| `SUPABASE_URL` | If invoice numbering still lives on Supabase RPC `generate_next_invoice_no`, set this + `SUPABASE_ANON_KEY` and pass a Supabase JWT in `JWT_DEALER_ADMIN` |
| `SUPABASE_ANON_KEY` | Anon key for staging Supabase project |
| `D4_PARALLEL` | Concurrency for the invoice race (default `10`) |
| `VERBOSE=1` | Print response detail on every check |

## Run

```bash
export STAGING_BASE_URL="https://api.staging.sanitileserp.com"
export JWT_SUPER_ADMIN="..."
export JWT_DEALER_ADMIN="..."
export JWT_SALESMAN="..."
export OTHER_DEALER_ID="..."
# optional for D4 against Supabase:
export SUPABASE_URL="https://wvpojbdlrkspojotspip.supabase.co"
export SUPABASE_ANON_KEY="..."

node scripts/uat/staging-harness.mjs
```

## Exit codes

- `0` — all MUST checks passed
- `1` — at least one MUST check failed (NOT SAFE FOR PRODUCTION)
- `2` — fatal harness error (missing env, crash)

## What each check does

### Section C
| ID | Check |
|---|---|
| C1 | Salesman `GET /api/products` list — no `cost_price` field |
| C2 | Salesman `GET /api/products/:id` — no `cost_price` field |
| C3 | Salesman `POST /api/products` — must return 401/403 |
| C4 | Salesman `DELETE /api/products/:id` — must return 401/403 |
| C5 | Dealer A admin asks for OTHER dealer's products — empty/blocked |
| C6 | Dealer A admin asks for OTHER dealer's customers — empty/blocked |
| C7 | Dealer A admin asks for OTHER dealer's suppliers — empty/blocked |
| C8 | Dealer A admin tries to write a customer into OTHER dealer — blocked |
| C9 | Unauthenticated `GET /api/products` — must return 401 |
| C10 | Salesman audit-log forge attempt — must be rejected or overwritten |
| C11 | Salesman calling `/api/subscriptions` admin — must return 401/403 |

### Section D4
| ID | Check |
|---|---|
| D4 | Fire `D4_PARALLEL` (default 10) concurrent invoice-no generations and assert all results are unique with zero errors. |
