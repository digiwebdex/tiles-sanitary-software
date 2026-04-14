# Backorder Billing / Sale Below Stock — Complete Feature Design

> **Feature Name in UI**: "Backorder Sale" / "Sale Below Stock"
> **Version**: 1.0
> **Date**: 2026-04-14
> **Status**: Implementation Ready

---

## SECTION 1 — FINAL FEATURE DESIGN

### What This Feature Is
**Backorder Sale** allows a dealer to create a full invoice/bill for a quantity that exceeds current stock. The system tracks the shortage ("backorder qty") and automatically resolves it when new stock arrives through purchases.

### UI Label
- **Primary**: "Backorder Sale"
- **Setting Toggle**: "Allow Sale Below Stock"
- **Badge on Invoice**: "Partial Stock" or "Backorder Pending"

### How It Behaves for Dealer Users
1. Dealer enters a sale for 100 boxes of a tile
2. System detects only 60 boxes are in stock
3. A **yellow warning** appears: "Stock Short: 40 boxes will be on backorder"
4. Dealer confirms → Sale is created for full 100 boxes
5. Stock deducts available 60 → stock goes to 0 (NOT negative)
6. 40 boxes are tracked as "backorder qty" on the sale item
7. When dealer purchases 40+ boxes later, system auto-allocates to this pending backorder
8. Fulfillment status updates from "Partial" → "Fulfilled"

### Strict Stock Mode vs Backorder Mode

| Aspect | Strict Stock Mode | Backorder Mode |
|--------|------------------|----------------|
| Sale > Stock | ❌ Blocked | ✅ Allowed with warning |
| Stock goes negative | Never | Never (backorder tracked separately) |
| Shortage tracking | N/A | Automatic |
| Auto-allocation on purchase | N/A | Yes (FIFO) |
| Default | ✅ Yes | Dealer must enable |

### Why This Is Valuable for Tile/Sanitary Dealers
- Tiles are often ordered in bulk from companies/factories with 7-30 day lead times
- Customers want to **lock in prices and place orders now**, even if stock hasn't arrived
- Dealers don't want to lose sales just because stock hasn't been received yet
- This mirrors how real tile showrooms operate: take the order, bill the customer, deliver when stock arrives

---

## SECTION 2 — BUSINESS RULES

### Rule 1: Normal Sale (Stock Sufficient)
- Stock = 100, Sale = 80 → Deduct 80, remaining stock = 20
- No backorder created. Fulfillment = "Fulfilled"

### Rule 2: Sale When Stock is Insufficient (Backorder Mode ON)
- Stock = 60, Sale = 100
- Deduct 60 from stock → stock = 0
- Create backorder_qty = 40 on the sale item
- Fulfillment status = "Partial"
- Invoice total is based on full 100 boxes (billing is complete)

### Rule 3: Partial Fulfillment
- Sale item: ordered = 100, available at sale = 60
- Deliverable now = 60 boxes
- Pending delivery = 40 boxes
- System allows challan/delivery for 60 immediately

### Rule 4: Purchase Receive After Shortage
- Dealer purchases 40 boxes of the same product
- System checks pending backorders for this product (FIFO by sale_date)
- Auto-allocates 40 boxes → backorder_qty reduces from 40 to 0
- Fulfillment status → "Fulfilled"
- Stock = 0 (all 40 allocated to pending order)

### Rule 5: Extra Stock Received Above Shortage
- Pending backorder = 40 boxes
- Purchase received = 50 boxes
- 40 allocated to backorder → backorder cleared
- 10 boxes remain as available stock

### Rule 6: Delivery Before Full Stock Arrival
- Allowed for the available portion only
- Cannot deliver more than (available_at_sale - already_delivered + newly_allocated)

### Rule 7: Cancellation
- If sale cancelled before any delivery: restore deducted stock, clear backorder
- If sale cancelled after partial delivery: restore only undelivered portion

### Rule 8: Returns
- Returns work on delivered quantity only
- Cannot return more than what was delivered
- Returned stock goes back to available inventory

### Rule 9: Stock Adjustment
- Manual stock adjustments do NOT auto-allocate to backorders
- Only purchase receives trigger auto-allocation

### Rule 10: Cash Sale vs Credit Sale
- Backorder works the same for both
- Full amount is billed at sale creation time
- Payment tracking is independent of delivery/fulfillment

---

## SECTION 3 — SYSTEM MODES

### Mode A: Strict Stock Mode (Default)
- Cannot sell more than available stock
- Error: "Insufficient stock (available: 60, requested: 100)"
- This is the CURRENT behavior

### Mode B: Backorder Mode
- Can sell more than available stock
- Warning shown, confirmation required
- Shortage tracked as backorder_qty

### Configuration
- **Level**: Dealer-level setting (each dealer can choose)
- **Column**: `dealers.allow_backorder` (boolean, default: false)
- **Who can toggle**: dealer_admin only
- **Where**: Settings page within dealer ERP panel

### Recommendation
- Default = **Strict Mode** (safe for new dealers)
- Backorder Mode = opt-in per dealer
- Product-level override is NOT recommended initially (adds complexity without proportional value)

---

## SECTION 4 — DATABASE / SCHEMA CHANGES

### 4.1 Modified Table: `dealers`
```sql
ALTER TABLE dealers ADD COLUMN allow_backorder boolean NOT NULL DEFAULT false;
```

### 4.2 Modified Table: `sale_items`
```sql
ALTER TABLE sale_items ADD COLUMN available_qty_at_sale numeric NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN backorder_qty numeric NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN allocated_qty numeric NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN fulfillment_status text NOT NULL DEFAULT 'fulfilled';
-- fulfillment_status values: 'fulfilled', 'partial', 'pending'
```

**Logic**:
- `available_qty_at_sale`: Stock available when sale was created
- `backorder_qty`: quantity - available_qty_at_sale (if positive), else 0
- `allocated_qty`: how much of the backorder has been fulfilled by subsequent purchases
- `fulfillment_status`:
  - `fulfilled`: backorder_qty = 0 OR allocated_qty >= backorder_qty
  - `partial`: 0 < allocated_qty < backorder_qty
  - `pending`: allocated_qty = 0 AND backorder_qty > 0

### 4.3 New Table: `backorder_allocations`
Tracks which purchase fulfilled which backorder.

```sql
CREATE TABLE backorder_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid NOT NULL REFERENCES dealers(id),
  sale_item_id uuid NOT NULL REFERENCES sale_items(id),
  purchase_item_id uuid NOT NULL REFERENCES purchase_items(id),
  product_id uuid NOT NULL REFERENCES products(id),
  allocated_qty numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 4.4 Modified Table: `sales`
```sql
ALTER TABLE sales ADD COLUMN has_backorder boolean NOT NULL DEFAULT false;
```

---

## SECTION 5 — SALE / INVOICE FLOW

### Step-by-step UX

1. **User adds items** to sale form as usual
2. **User clicks "Create Sale"**
3. **System checks stock** for each item:
   - If all items have sufficient stock → proceed normally
   - If any item has insufficient stock AND `allow_backorder = false` → show error, block
   - If any item has insufficient stock AND `allow_backorder = true` → show warning dialog

4. **Warning Dialog** (Backorder Confirmation):
```
⚠️ Stock Shortage Detected

Item              | Ordered | Available | Short
RAK Glossy 60x60  | 100 box | 60 box    | 40 box
Commode Set A      | 5 pc    | 5 pc      | —

40 boxes will be placed on backorder.
Stock will be fulfilled automatically when purchased.

[Cancel] [Confirm Backorder Sale]
```

5. **After confirmation**:
   - Sale saved with full amounts
   - Sale items get `backorder_qty` populated
   - Sale gets `has_backorder = true`
   - Stock deducted only for available portion
   - Invoice shows full quantity with "Backorder" badge

### Invoice Display
- Show badge: 🟡 "Backorder Pending" or 🟢 "Fully Stocked"
- In sale list, show fulfillment icon

---

## SECTION 6 — PURCHASE / STOCK RECEIVE FLOW

### When Purchase is Created
1. Stock is added normally (existing logic)
2. **After stock addition**, system queries pending backorders for each product:
   ```sql
   SELECT si.* FROM sale_items si
   JOIN sales s ON si.sale_id = s.id
   WHERE si.product_id = :product_id
   AND si.dealer_id = :dealer_id
   AND si.backorder_qty > si.allocated_qty
   AND s.sale_status != 'cancelled'
   ORDER BY s.sale_date ASC, s.created_at ASC
   ```
3. **FIFO allocation**: oldest pending backorder gets stock first
4. For each pending backorder:
   - Allocate min(remaining_purchase_qty, pending_backorder_qty)
   - Create `backorder_allocation` record
   - Update `sale_items.allocated_qty`
   - Update `sale_items.fulfillment_status`
   - Deduct allocated qty from stock (since it was already added)
5. Remaining stock (if any) stays as available inventory

### Example
```
Pending backorders:
  Sale #101 (Jan 5): 40 boxes short
  Sale #105 (Jan 8): 20 boxes short

Purchase received: 50 boxes

Allocation:
  Sale #101 → 40 boxes allocated (fulfilled ✅)
  Sale #105 → 10 boxes allocated (partial, still 10 pending)

Remaining stock: 0 boxes
```

---

## SECTION 7 — DELIVERY / CHALLAN FLOW

### Deliverable Quantity Calculation
```
deliverable_now = available_qty_at_sale + allocated_qty - already_delivered
```

### Multi-Delivery Flow
1. Sale = 100 boxes, Stock = 60
2. **Delivery #1**: 60 boxes (available stock) → delivered
3. Purchase arrives: 40 boxes → auto-allocated to this sale
4. **Delivery #2**: 40 boxes → delivered
5. **Final status**: Fulfilled, Total Delivered = 100

### Challan Updates
- Challan shows "deliverable now" vs "pending delivery"
- Multiple challans can be created against one sale
- Each delivery deducts from deliverable pool

---

## SECTION 8 — PERMISSIONS / APPROVALS

| Role | Can Create Backorder Sale | Needs Approval | Can View Backorder Reports |
|------|--------------------------|----------------|---------------------------|
| dealer_admin | ✅ Yes | No | ✅ Yes |
| salesman | ⚠️ Configurable | Optional (dealer setting) | Limited view |
| cashier | ❌ No | N/A | ❌ No |

### Settings for Permissions
- `require_approval_for_backorder`: If true, salesman must get dealer_admin approval
- `max_backorder_qty_per_item`: Maximum shortage allowed per line item (0 = unlimited)
- `max_backorder_amount_per_invoice`: Maximum total backorder value per invoice

### Override Reason
When backorder is created, store:
- `override_reason` in audit log
- Who approved (if approval flow is enabled)

---

## SECTION 9 — SETTINGS

### Dealer Settings (stored in `dealers` table)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| allow_backorder | boolean | false | Master switch for backorder sales |

### Future Settings (Phase 2)
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| require_approval_for_backorder | boolean | false | Salesman needs admin approval |
| auto_allocate_on_purchase | boolean | true | Auto-fulfill backorders on purchase |
| max_backorder_qty_per_item | number | 0 | 0 = unlimited |
| notify_on_backorder_fulfilled | boolean | true | Email/SMS when backorder resolved |

### Recommendation
For Phase 1, implement only `allow_backorder` on the dealers table. Keep it simple. Add granular settings in Phase 2 based on dealer feedback.

---

## SECTION 10 — REPORTS AND DASHBOARDS

### New Reports

1. **Backorder Report**
   - All sales with pending backorders
   - Columns: Invoice#, Customer, Product, Ordered Qty, Backorder Qty, Allocated Qty, Status
   - Filter by: date range, product, customer, status

2. **Pending Fulfillment Report**
   - Products that have unfulfilled backorders
   - Shows total pending qty across all sales
   - Useful for purchase planning

3. **Product Shortage Demand Report**
   - Aggregate view: which products have the most backorder demand
   - Helps dealer decide what to purchase next

4. **Customer Pending Delivery Report**
   - Per customer: what's ordered vs what's deliverable
   - Helps manage customer expectations

### Dashboard Widgets (Owner)
- 🔴 **Pending Backorders**: Count of sale items with unfulfilled backorders
- 📦 **Top 5 Products with Shortages**: Products with highest backorder demand
- 📊 **Backorder Fulfillment Rate**: % of backorders fulfilled in last 30 days

---

## SECTION 11 — ACCOUNTING / LEDGER IMPACT

### Customer Ledger
- **Full invoice amount** is posted at sale creation (same as current)
- Backorder does NOT affect the billing amount
- Customer owes the full amount regardless of delivery status

### Stock Valuation
- Only deducted stock counts for COGS
- Backorder qty does NOT affect current stock valuation
- When backorder is fulfilled (purchase → allocation → deduction), COGS is updated

### Cash/Credit Flow
- No change from current behavior
- Payment collection is independent of delivery
- Due amount reflects full invoice amount

### Partial Delivery
- Delivery creates delivery record but doesn't affect billing
- Billing is complete at sale creation

---

## SECTION 12 — EDGE CASES

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Stock=60, Sale=100, Purchase=40 | Backorder=40, Purchase fulfills all 40, status=Fulfilled |
| 2 | Stock=60, Sale=100, Purchase=50 | Backorder=40, 40 allocated, 10 extra stock |
| 3 | Stock=60, Sale=100, Only 20 received later | Backorder=40, 20 allocated, 20 still pending |
| 4 | Sale cancelled before stock arrives | Clear backorder, restore 60 deducted stock |
| 5 | Sale partially delivered, then cancelled | Restore only undelivered portion, clear remaining backorder |
| 6 | Customer returns part of delivered qty | Normal return flow, stock restored |
| 7 | Multiple customers backordered for same product | FIFO by sale_date — oldest sale gets priority |
| 8 | New stock arrives, priority decision | FIFO (oldest sale_date first) |
| 9 | Tile product with box/sft | Backorder tracked in boxes, SFT calculated automatically |
| 10 | Sanitary item by piece | Backorder tracked in pieces |

---

## SECTION 13 — IMPLEMENTATION PLAN

### Batch 1: Core Schema + Sale Flow (Current Sprint)
**Files affected:**
- `supabase/migrations/` — new migration
- `src/services/stockService.ts` — allow partial deduction
- `src/services/salesService.ts` — backorder tracking on sale items
- `src/modules/sales/SaleForm.tsx` — stock warning UI
- `src/pages/sales/CreateSale.tsx` — backorder confirmation flow

**Risks:** Stock math must be exact. Test with box_sft and piece products.

### Batch 2: Purchase Auto-Allocation + Delivery Updates
**Files affected:**
- `src/services/purchaseService.ts` — auto-allocation after purchase
- `src/services/deliveryService.ts` — deliverable qty calculation
- `src/modules/deliveries/` — UI updates for partial delivery

**Risks:** FIFO allocation must handle concurrent purchases correctly.

### Batch 3: Reports + Dashboard + Settings
**Files affected:**
- `src/modules/reports/` — new backorder reports
- `src/modules/dashboard/OwnerDashboard.tsx` — new widgets
- `src/pages/admin/` — dealer settings for backorder mode

---

## SECTION 14 — ACCEPTANCE CRITERIA

1. ✅ User can create invoice for 100 boxes when stock is only 60
2. ✅ System stores 40 as backorder_qty on sale_item
3. ✅ Sale gets has_backorder = true flag
4. ✅ Stock deducts only 60 (not 100), stock = 0
5. ✅ Purchase of 40 auto-allocates and clears backorder
6. ✅ Purchase of 50 clears backorder and leaves 10 as free stock
7. ✅ Multiple deliveries work correctly against one backorder sale
8. ✅ Fulfillment status transitions correctly: pending → partial → fulfilled
9. ✅ Reports show correct pending quantities
10. ✅ Permission rules enforced (backorder blocked in strict mode)
11. ✅ Works correctly for both box_sft and piece products
12. ✅ COGS calculation remains accurate
13. ✅ Customer ledger shows full invoice amount regardless of delivery status

---

## SECTION 15 — UI LABELS / TERMINOLOGY

| Internal Term | UI Label (English) | UI Label (Bengali) |
|--------------|-------------------|-------------------|
| backorder_qty | Backorder Qty | ব্যাকঅর্ডার পরিমাণ |
| fulfillment_status | Fulfillment | পূরণ অবস্থা |
| available_qty_at_sale | Available at Sale | বিক্রয়কালে মজুদ |
| allocated_qty | Allocated Qty | বরাদ্দ পরিমাণ |
| has_backorder | Has Backorder | ব্যাকঅর্ডার আছে |
| allow_backorder | Allow Sale Below Stock | স্টকের নিচে বিক্রয় অনুমতি |
| fulfilled | Fulfilled | পূর্ণ |
| partial | Partial | আংশিক |
| pending | Pending | বাকি |

### Status Badges
- 🟢 **Fulfilled** — All items stocked and deliverable
- 🟡 **Partial** — Some items on backorder, some allocated
- 🔴 **Pending** — Backorder items not yet allocated

---

## Architecture Diagram

```
SALE CREATION                 PURCHASE RECEIVE
     │                              │
     ▼                              ▼
Check Stock ──► Sufficient? ──► Normal deduction
     │                              │
     ▼ (Insufficient)               ▼
Show Warning                   Add Stock
     │                              │
     ▼ (Confirm)                    ▼
Deduct Available             Query Pending
Save backorder_qty           Backorders (FIFO)
     │                              │
     ▼                              ▼
Invoice Created              Allocate Stock
has_backorder=true           Update fulfillment
     │                              │
     ▼                              ▼
Delivery (partial)           Deduct allocated
     │                         from new stock
     ▼                              │
Challan for                       ▼
deliverable qty              Remaining = free stock
```
