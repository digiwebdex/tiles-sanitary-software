---
name: VPS Migration Phase 3I
description: Products already on VPS via dataClient; stock reads intentionally deferred (mutations are FIFO/RPC heavy)
type: feature
---
# Phase 3I — Products + Stock status

**Status:** No new migration work needed.

**Products:** already fully VPS-routed via `dataClient("PRODUCTS")` since
Phase 3D-cutover. Production env (`VITE_DATA_PRODUCTS=vps`) sends every
list/getById/create/update/delete to `/api/products` on the VPS. Backend
route already enforces tenant scope, role gates (dealer_admin for writes),
salesman cost-strip, and SKU/barcode uniqueness.

**Stock:** the public surface of `stockService` is mutation-only
(addStock, deductStock, reserveStock, unreserveStock, deductReservedStock,
deductBrokenStock, updateAverageCost, deductStockWithBackorder). All of
these are FIFO/RPC-driven and explicitly stay on Supabase per the
original Phase 3D contract. The `/api/stock` GET routes exist for
shadow-mode parity checks but are not consumed by UI.

**Reads consumed by UI (e.g. dashboard low-stock, inventory valuation)**
go through `dashboardService` / `reportService`, not `stockService`, so
they're addressed in their respective phases.

**Next phases:**
- 3J Reports/Analytics reads (`reportService`, `pricingTierReportService`,
  `projectReportService`, `supplierPerformanceService`).
- 3K Sales mutations (FIFO + ledger + notifications).
- 3L Purchases mutations (landed cost + batch creation + supplier ledger).
- 3M Stock mutations (reservations, FIFO deduct, broken stock).

No code changes for 3I — phase recorded for traceability.
