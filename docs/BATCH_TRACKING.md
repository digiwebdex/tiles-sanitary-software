# Batch / Shade / Caliber / Lot Tracking

## Overview
Track tile stock by batch/lot/shade/caliber so the system can prevent mixed-shade problems and support same-batch delivery.

## Status Model
- **product_batches** = operational source of truth for batch-level stock
- **stock** table = aggregate summary derived from batch totals
- Sync: server-side DB functions guarantee atomic consistency (no client-side reliance)

## Key Tables
| Table | Purpose |
|---|---|
| `product_batches` | Batch identity + per-batch stock qty |
| `sale_item_batches` | Junction: which batches allocated per sale item |
| `delivery_item_batches` | Junction: which batches used per delivery item |
| `purchase_items.batch_id` | Links each purchase line to its batch |

## Atomic DB Functions
| Function | Purpose |
|---|---|
| `allocate_sale_batches` | Atomic: deduct batches (FOR UPDATE lock) → insert sale_item_batches → deduct aggregate stock → update sale_item.allocated_qty |
| `restore_sale_batches` | Atomic: restore batch qty (FOR UPDATE lock) → delete sale_item_batches → restore aggregate stock |
| `deduct_stock_unbatched` | Deduct aggregate stock only for legacy/unbatched products |

### Transaction Boundaries
- **allocate_sale_batches**: single PL/pgSQL function = single DB transaction. If any step fails (e.g., batch not found), the entire operation rolls back. Row-level `FOR UPDATE` locks prevent concurrent deduction.
- **restore_sale_batches**: same pattern — lock, restore, cleanup, all atomic.
- **Mismatch prevention**: batch qty and aggregate stock are always modified in the same transaction. No intermediate state is visible to other connections.

## Business Rules
1. One purchase line = one batch
2. Same SKU + same shade + caliber + lot + batch_no → merge (top-up)
3. Different shade/caliber → new batch
4. Sanitary items → DEFAULT batch auto-created (collision-safe: AUTO-YYYYMMDD-XXXXX)
5. Sale allocation uses FIFO (oldest batch first)
6. Mixed-shade allocation triggers warning dialog
7. Backorder qty remains batch-unassigned until future purchase
8. Zero qty → batch marked depleted; future top-up reactivates
9. Legacy stock without batches: treated as unbatched, no batch allocation attempted

## Merge Safety
- DB unique constraint not possible (nullable shade/caliber/lot columns)
- Service-layer guard: `findOrCreateBatch` does exact null-safe matching:
  - null/empty treated as equivalent (normalized to null before query)
  - `.is("shade_code", null)` used for null values (not `.eq`)
  - Prevents duplicate batch rows for same identity

## Legacy Stock Strategy
- Products with zero active batches are treated as **unbatched**
- FIFO allocation returns empty → `deduct_stock_unbatched` RPC handles aggregate-only deduction
- No batch records created retroactively for legacy stock
- On cancel/edit: unbatched portion restored via `stockService.restoreStock`

## Implementation Batches
- **Batch 1** (Done): Schema + Purchase flow + Batch stock summary
- **Batch 2** (Done): Sale FIFO allocation + Mixed-shade warnings + sale_item_batches + batch deduction (atomic)
- **Batch 3** (Planned): Delivery batch flow + Reports
