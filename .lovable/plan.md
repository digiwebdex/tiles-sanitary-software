

## Purchase Module -- Last Cost Information Upgrade

### What will change

Currently the purchase form fetches only `landed_cost` per product (a single number). This plan upgrades it to show richer "last purchase" context and removes auto-fill so operators must enter the rate manually.

### Changes (single file)

**File: `src/modules/purchases/PurchaseForm.tsx`**

1. **Upgrade the `lastCostMap` query** to fetch more fields per product:
   - `purchase_rate` (last rate)
   - `landed_cost`
   - `purchases.purchase_date` (last purchase date)
   - `purchases.supplier_id` (last supplier ID)
   - Also fetch `average_cost_per_unit` from `stock` table for each product

   The map will store an object per product_id:
   ```text
   Map<string, {
     purchase_rate: number,
     landed_cost: number,
     purchase_date: string,
     supplier_id: string,
     supplier_name: string
   }>
   ```
   A second small query (or join with suppliers) will resolve supplier names.

   Additionally, fetch a `Map<string, number>` for average cost from the `stock` table.

2. **Remove auto-fill of `purchase_rate`** in the `addProduct` function -- set `purchase_rate: 0` instead of `lastCost ?? 0`.

3. **Enhance the Product column** in the items table to show:
   - "Last Rate: [amount] (DD/MM/YYYY)" with supplier name
   - "Avg Cost: [amount]"
   - These are read-only info labels below the product name/SKU

4. **Add a rate-change warning badge** next to the Rate input field:
   - Compare current `watchItems[idx].purchase_rate` with the last purchase rate from the map
   - If both are > 0 and differ, show an orange/amber badge: "Rate changed from last purchase"

5. **Dealer isolation**: All queries already filter by `dealer_id` -- no change needed.

### Technical Details

**Query 1 -- Last purchase info (upgraded existing query):**
```sql
-- Fetched via Supabase JS client
purchase_items
  .select("product_id, purchase_rate, landed_cost, purchases!inner(purchase_date, supplier_id, suppliers(name))")
  .eq("dealer_id", dealerId)
  .order("purchases(purchase_date)", { ascending: false })
```
Build a `Map<string, LastPurchaseInfo>` keeping only the first (most recent) entry per product_id.

**Query 2 -- Average cost from stock:**
```sql
stock
  .select("product_id, average_cost_per_unit")
  .eq("dealer_id", dealerId)
```
Build a `Map<string, number>` for average cost.

**UI in table rows (Product cell):**
```text
Product Name
SKU-001
Last Rate: ৳ 500 (15/02/2026) - SupplierName
Avg Cost: ৳ 480
```

**Rate change warning (Rate cell):**
When the entered rate differs from last rate and both are > 0, show below the input:
```text
[!] Rate changed from last purchase
```
Styled with `text-amber-600` or using the existing Badge component with `variant="outline"`.

**addProduct change:**
```typescript
append({
  product_id: productId,
  quantity: 0,
  purchase_rate: 0,  // Do NOT auto-fill
  offer_price: 0,
  ...
});
```

### Files Modified
- `src/modules/purchases/PurchaseForm.tsx` (single file, all changes)

No database migration needed -- all required data already exists in `purchase_items`, `purchases`, `suppliers`, and `stock` tables.
