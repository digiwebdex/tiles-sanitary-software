---
name: VPS Migration Phase 3U-24
description: deliveryService read paths fully migrated to VPS via /api/deliveries (list, getById, batches, delivered-qty, stock); zero Supabase imports remain
type: feature
---

## Scope
Migrated all 5 remaining read methods in `deliveryService.ts` from Supabase to the VPS backend. Frontend now has zero Supabase imports for deliveries.

## New backend endpoints (all under `/api/deliveries`)
- `GET /` — paginated list (25/page) with statusFilter, projectId, siteId. Enriches each row with: challans{challan_no}, sales{invoice_number, customers{name,phone,address}}, projects{id,project_name,project_code}, project_sites{id,site_name,address}, delivery_items[{id,quantity,products{name,unit_type}}].
- `GET /:id` — full detail with sales.sale_items, products(sku, per_box_sft), project_sites contact fields.
- `GET /:id/batches` — joins delivery_item_batches → product_batches; returns embedded `product_batches` snapshot.
- `GET /sale/:saleId/delivered-qty` — Record<sale_item_id, total_delivered_qty>. **Path order matters** — defined before `/:id` to avoid collision.
- `GET /stock?productIds=a,b,c` — Record<product_id, {box_qty, piece_qty}> for over-delivery client-side gate.

## Shape compatibility
All responses mirror the legacy Supabase nested-object shape so DeliveryList, DeliveryDetailDialog, CreateDeliveryDialog, and BackorderReports work without UI changes.

## Files changed
- `backend/src/routes/deliveries.ts` — +302 lines (5 GET handlers appended)
- `src/services/deliveryService.ts` — full rewrite, Supabase import removed (108 lines, was 168)

## Deploy
Backend route addition: requires VPS pull + build + pm2 restart before frontend Publish.
