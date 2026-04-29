
## সমস্যা ব্যাখ্যা (কেন ড্যাশবোর্ড খালি)

আপনার ড্যাশবোর্ডে সব কিছু `0` / খালি দেখাচ্ছে কারণ:

- ড্যাশবোর্ড ও বেশ কিছু সার্ভিস (productService, stockService, salesService, dashboardService) এখনো **পুরাতন Supabase ডাটাবেস** থেকে ডাটা পড়ছে।
- কিন্তু আপনার login এখন **VPS backend (api.sanitileserp.com → port 3003 → Postgres 5440)** থেকে কাজ করছে।
- ফলে: লগইন হচ্ছে VPS থেকে, কিন্তু ড্যাশবোর্ড পড়ছে Supabase থেকে → যেখানে আপনার নতুন ডিলারের কোনো ডাটা নেই → তাই সব `0`।

এটাই আপনার দেখা Products পেজ "0 stock", "৳0.00 stock value" এর মূল কারণ। প্রোডাক্ট লিস্ট দেখা যাচ্ছে কারণ সেগুলো হয়ত আগে Supabase-এ যোগ হয়েছিল, কিন্তু নতুন stock/sales VPS-এ যাচ্ছে।

## ড্যাশবোর্ড কোন ডাটার সাথে লিংক

`src/services/dashboardService.ts` এই টেবিলগুলো থেকে গণনা করে:
- `sales` + `sale_items` → Today/Monthly Sales, Profit, SFT Sold, Top Customers
- `payments` → Collection
- `purchases` → Monthly Purchase, Supplier Payable
- `products` + `product_batches` → Total Stock Value, Low Stock, Dead Stock
- `customers` → Customer Due, Overdue, Credit Exceeded

**স্টক কীভাবে যোগ হয় (সঠিক প্রবাহ):**
1. **Products** → "Add Product" দিয়ে SKU তৈরি (এখন quantity = 0)
2. **Suppliers** → সাপ্লায়ার যোগ করুন
3. **Purchases** → "New Purchase" দিয়ে সাপ্লায়ার থেকে কেনা entry দিন → এতে `product_batches` তৈরি হয়ে stock বাড়ে এবং landed cost সেট হয়
4. বিকল্প: Products পেজে প্রোডাক্ট-এর "Actions → Stock Adjust" দিয়ে opening stock দিতে পারেন

কিন্তু এই পুরো prosess আপনার VPS DB-তে লেখা হলেও ড্যাশবোর্ড Supabase পড়ছে → তাই কিছুই দেখা যাবে না যতক্ষণ না সার্ভিসগুলো VPS-এ rewire করা হয়।

## সমাধান প্ল্যান

আপনি phase 1 VPS auth migration শেষ করেছেন। এখন **Phase 2: data path** কে VPS-এ আনতে হবে। এটাই permanent fix — নাহলে প্রতিটা ডিলারের একই খালি ড্যাশবোর্ড সমস্যা থাকবে।

### Step 1 — VPS backend-এ missing endpoints যোগ করুন
`backend/src/routes/` এ নতুন route ফাইল:
- `dashboard.ts` — `GET /api/dashboard` → dashboardService.ts-এর সব aggregation queries (sales, payments, purchases, stock value, low stock, charts) Knex দিয়ে server-side গণনা করবে। dealer_id middleware থেকে আসবে।
- `sales.ts`, `payments.ts`, `purchases.ts` — basic CRUD (list/create) যাতে পুরো invoice/payment flow VPS-এ চলে।
- `stockAdjust.ts` — opening stock / manual adjustment এর জন্য।

প্রতিটা route অবশ্যই `tenant.ts` middleware ব্যবহার করবে (dealer_id scoping)।

### Step 2 — Frontend services rewire (Supabase → VPS)
`src/lib/data/vpsAdapter.ts` এ নতুন methods যোগ করে এই ফাইলগুলো VPS adapter-এ পাঠাব:
- `src/services/dashboardService.ts` → একটি single `GET /api/dashboard` কল
- `src/services/productService.ts` (5 supabase ref)
- `src/services/stockService.ts` (13 ref)
- `src/services/salesService.ts` (44 ref)
- `src/services/purchaseService.ts`, `paymentService.ts` (একই ভাবে)

`AUTH_USE_VPS` flag চালু থাকলে VPS adapter ব্যবহার হবে, নাহলে fallback Supabase — যাতে gradual rollout সম্ভব।

### Step 3 — Data migration script
`scripts/migrate-supabase-to-vps.ts` — পুরাতন Supabase-এর existing dealer ডাটা (products, customers, sales, payments, batches) export করে VPS Postgres-এ import করবে। এক-বার চলবে প্রতি ডিলারের জন্য।

### Step 4 — Verify on VPS
- PM2 restart, nginx unchanged
- Test: একজন dealer-এ লগইন করে Purchase দিন → Products → quantity বাড়ছে কিনা → Dashboard → Total Stock Value আসছে কিনা
- লগ চেক: `pm2 logs tilessaas-backend`

### Step 5 — Memory + RUNBOOK update
- `mem://migration/vps-phase-2.md` লিখব: কোন services migrated, কোন endpoints যোগ হয়েছে।
- `deploy/RUNBOOK.md` এ "Adding stock" section লিখব ডিলারদের জন্য (Bengali guide)।

## আপনি এখনই যা করতে পারেন (workaround, প্ল্যান approve করার আগে)

আপনি যদি দ্রুত পুরাতন Supabase ড্যাশবোর্ডে ডাটা দেখতে চান:
1. লগআউট করে আগের Supabase-based account-এ login করুন (যদি থাকে), অথবা
2. Purchases পেজে গিয়ে "New Purchase" দিয়ে stock entry করুন — এটা Supabase-এ সেভ হবে এবং ড্যাশবোর্ডে দেখাবে।

কিন্তু এটা স্থায়ী সমাধান না। আপনার "many dealers, business will fall down" concern-এর জন্য Step 1-5 implement করতেই হবে।

## আনুমানিক স্কোপ

- ৬টা নতুন backend route ফাইল (~৪০০ লাইন)
- ৫টা frontend service rewire (~৩০০ লাইন বদল)
- ১টা migration script
- ১টা memory + RUNBOOK update

Approve করলে আমি build mode-এ implement শুরু করব।
