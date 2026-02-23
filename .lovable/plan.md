

# Partial Delivery Tracking (আংশিক ডেলিভারি ট্র্যাকিং)

## Problem
Currently, when a delivery is created from a sale, it links to the entire sale without tracking which specific items or quantities were actually delivered. If a customer orders 20 boxes but only 5 are in stock, there's no way to deliver 5 now and track the remaining 15 as pending.

## Solution
Implement a **partial delivery system** where each delivery tracks exactly which items and quantities are being delivered. Multiple deliveries can be created against the same sale, and the system shows remaining/pending quantities until all items are fully delivered.

## How It Will Work (User Flow)

1. A sale is created for 20 boxes of Product A
2. User clicks "Add Delivery" on the sale -- a dialog opens showing all sale items with ordered quantities and available stock
3. User enters delivery quantities (e.g., 5 boxes -- limited by available stock)
4. First delivery is created with 5 boxes; sale shows "Partially Delivered" status
5. Later, when more stock arrives, user creates another delivery for the remaining 15 boxes
6. Once total delivered = total ordered, the sale/delivery status shows "Completed"

## Technical Plan

### 1. New Database Table: `delivery_items`

```sql
CREATE TABLE public.delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.deliveries(id),
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id),
  product_id uuid NOT NULL,
  dealer_id uuid NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

With RLS policies matching the existing `deliveries` table pattern (dealer admin manage, dealer users view, salesmen create, subscription required, super admin full access).

### 2. Update `deliveries` Table

Add a `delivery_no` text column to auto-generate delivery reference numbers (e.g., `DL-00001`).

### 3. Service Layer Changes (`deliveryService.ts`)

- **`create()`**: Accept an `items` array with `{ sale_item_id, product_id, quantity }`. Insert into `delivery_items` alongside the delivery record. Deduct stock for delivered quantities.
- **`getDeliveredQtyBySale(saleId)`**: New method to aggregate total delivered quantities per sale_item from `delivery_items`.
- **`getById()`**: Update query to include `delivery_items(*, products(name, sku, unit_type, per_box_sft))`.
- **`list()`**: Update query to include delivery_items count for display.

### 4. New "Add Delivery" Dialog (`CreateDeliveryDialog.tsx`)

Replace the current one-click delivery creation with a dialog that:
- Fetches sale items and their ordered quantities
- Queries already-delivered quantities (from previous deliveries)
- Shows remaining quantity per item
- Checks current stock availability
- Lets user input how many to deliver per item (capped by min of remaining and available stock)
- Creates delivery + delivery_items records

### 5. Update `DeliveryDetailDialog.tsx`

- Show delivery-specific items (from `delivery_items`) instead of all sale items
- Add a "Delivery Progress" section showing: Ordered vs Delivered vs Remaining per item
- Show overall completion percentage

### 6. Update `DeliveryList.tsx`

- Show item count per delivery
- Add a progress indicator (e.g., "5/20 boxes delivered")

### 7. Update `SaleList.tsx`

- Replace the simple `addDeliveryMutation` with opening the new `CreateDeliveryDialog`
- Show delivery progress on sale rows (e.g., badge "Partial Delivery 5/20")

### 8. Update Sale Status Tracking

- Add `partially_delivered` as a recognized sale_status
- When a partial delivery is made, update sale_status to `partially_delivered`
- When all items are fully delivered, update to `delivered` or `completed`

### Files to Create
- `src/modules/deliveries/CreateDeliveryDialog.tsx` -- New dialog with item-level delivery input

### Files to Modify
- `src/services/deliveryService.ts` -- Add items support, delivery number generation, delivered qty aggregation
- `src/modules/deliveries/DeliveryDetailDialog.tsx` -- Show delivery-specific items and progress
- `src/modules/deliveries/DeliveryList.tsx` -- Show delivery progress info
- `src/modules/sales/SaleList.tsx` -- Replace one-click delivery with dialog
- Database migration for `delivery_items` table and `delivery_no` column

