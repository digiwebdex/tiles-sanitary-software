---
name: VPS Migration Phase 3U-25
description: projectService (full surface — projects + project_sites CRUD + pickers + lookup + next-code) on VPS via /api/projects
type: feature
---

## Scope
Migrated `src/services/projectService.ts` (entire file, all 11 methods) from Supabase to VPS. Zero Supabase imports remain.

## New backend route: `backend/src/routes/projects.ts`
Mounted at `/api/projects` (between `/api/reports/projects` and `/api/expenses` in `index.ts`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/next-code` | Wraps `get_next_project_code()` PL/pgSQL function (PRJ-NNNN sequence) |
| GET | `/picker?customerId=` | Active projects for dropdowns (lightweight) |
| GET | `/lookup?projectId=&siteId=` | Project + site detail by id (for documents) |
| GET | `/?search=&status=&customerId=` | Full list with customer join |
| GET | `/:id` | Single project |
| POST | `/` | Create (auto-generates project_code if missing) |
| PUT | `/:id` | Partial update |
| DELETE | `/:id` | Hard delete (handles 23503 FK violation → 409) |
| GET | `/:id/sites` | All sites for a project |
| GET | `/:id/sites/picker` | Active sites for dropdowns |
| POST | `/:id/sites` | Create site (project_id from path is authoritative) |
| PUT | `/sites/:siteId` | Update site |
| DELETE | `/sites/:siteId` | Delete site (handles 23503 FK violation → 409) |

## Notes
- All mutations require `dealer_admin` or `super_admin` (matches UI gates).
- Reads accessible to all roles in dealer scope (salesman needs project picker for sales).
- Foreign-key violation handler returns 409 with a friendly message instead of 500.
- `project_code` falls back to `get_next_project_code()` RPC when blank (matches legacy behavior).

## Files changed
- `backend/src/routes/projects.ts` — new (~430 lines)
- `backend/src/index.ts` — import + mount
- `src/services/projectService.ts` — rewritten (274 → ~190 lines, no Supabase)

## Deploy
Backend route addition: requires VPS pull + build + pm2 restart before frontend Publish.
