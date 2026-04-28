// Demo dealer seed — service-role only.
// Creates a fully-populated demo tenant for product presentations.
// Idempotent: if "Sanitiles Demo Dealer" already exists, returns its ids without recreating.
//
// SECURITY: callable only by an existing super_admin. All writes are scoped to the
// new demo dealer_id. No cross-tenant leakage.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEMO_DEALER_NAME = "Sanitiles Demo Dealer";
const DEMO_PASSWORD = "DemoSanitiles2026!";
const DEMO_ADMIN_EMAIL = "demo.admin@sanitileserp.com";
const DEMO_SALES_EMAIL = "demo.sales@sanitileserp.com";
const DEMO_CASHIER_EMAIL = "demo.cashier@sanitileserp.com";
const PRO_PLAN_ID = "b978214c-b49e-4aa4-ade7-8aa9cb298c13";

type SC = ReturnType<typeof createClient>;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function ensureUser(sc: SC, email: string, password: string, name: string, dealerId: string, role: "dealer_admin" | "salesman"): Promise<string> {
  // Check existing
  const { data: existing } = await sc.auth.admin.listUsers();
  const found = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  let userId: string;
  if (found) {
    userId = found.id;
    // ensure password matches (reset)
    await sc.auth.admin.updateUserById(userId, { password });
  } else {
    const { data, error } = await sc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error || !data?.user) throw new Error(`createUser ${email}: ${error?.message}`);
    userId = data.user.id;
  }
  await sc.from("profiles").upsert({ id: userId, name, email, dealer_id: dealerId });
  // role: ensure exists
  const { data: roleRow } = await sc.from("user_roles").select("user_id").eq("user_id", userId).eq("role", role).maybeSingle();
  if (!roleRow) {
    await sc.from("user_roles").insert({ user_id: userId, role });
  }
  return userId;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ---- AuthZ: must be super_admin ----
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anon.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerId = claimsData.claims.sub;
    const sc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleCheck } = await sc.from("user_roles").select("role").eq("user_id", callerId).eq("role", "super_admin").maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const log: string[] = [];
    const summary: Record<string, number> = {};
    const lg = (m: string) => { console.log("[seed]", m); log.push(m); };

    // ============================================================
    // SECTION 1: Demo dealer
    // ============================================================
    let dealerId: string;
    const { data: existingDealer } = await sc.from("dealers").select("id").eq("name", DEMO_DEALER_NAME).maybeSingle();
    if (existingDealer) {
      dealerId = existingDealer.id;
      lg(`Reusing existing demo dealer ${dealerId}`);
      // refuse to repopulate if products already exist — return early summary
      const { count: productCount } = await sc.from("products").select("id", { count: "exact", head: true }).eq("dealer_id", dealerId);
      if ((productCount || 0) > 0) {
        return new Response(JSON.stringify({
          success: true,
          already_seeded: true,
          dealer_id: dealerId,
          message: `Demo dealer already exists with ${productCount} products. Refusing to duplicate. Delete demo dealer first if you want fresh seed.`,
          credentials: {
            dealer_admin: { email: DEMO_ADMIN_EMAIL, password: DEMO_PASSWORD },
            salesman: { email: DEMO_SALES_EMAIL, password: DEMO_PASSWORD },
            cashier: { email: DEMO_CASHIER_EMAIL, password: DEMO_PASSWORD },
          },
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      const { data: dealer, error: dErr } = await sc.from("dealers").insert({
        name: DEMO_DEALER_NAME,
        phone: "01711000000",
        address: "Demo Showroom, Mirpur DOHS, Dhaka",
        status: "active",
        challan_template: "modern",
        allow_backorder: true,
        enable_reservations: true,
        default_wastage_pct: 10,
      }).select("id").single();
      if (dErr) throw new Error(`dealer: ${dErr.message}`);
      dealerId = dealer.id;
      lg(`Created demo dealer ${dealerId}`);
    }

    // Subscription (active for 1 year)
    const { data: existingSub } = await sc.from("subscriptions").select("id").eq("dealer_id", dealerId).maybeSingle();
    if (!existingSub) {
      await sc.from("subscriptions").insert({
        dealer_id: dealerId,
        plan_id: PRO_PLAN_ID,
        status: "active",
        billing_cycle: "yearly",
        start_date: daysAgo(30),
        end_date: daysAgo(-365),
      });
      lg("Created Pro subscription (1 year active)");
    }

    // Invoice sequence
    await sc.from("invoice_sequences").upsert({ dealer_id: dealerId, next_invoice_no: 1, next_challan_no: 1, next_quotation_no: 1 });

    // ============================================================
    // SECTION 1b: Users
    // ============================================================
    const adminId = await ensureUser(sc, DEMO_ADMIN_EMAIL, DEMO_PASSWORD, "Demo Admin", dealerId, "dealer_admin");
    const salesId = await ensureUser(sc, DEMO_SALES_EMAIL, DEMO_PASSWORD, "Demo Salesman", dealerId, "salesman");
    const cashierId = await ensureUser(sc, DEMO_CASHIER_EMAIL, DEMO_PASSWORD, "Demo Cashier", dealerId, "salesman");
    lg(`Users provisioned: admin=${adminId}, sales=${salesId}, cashier=${cashierId}`);

    // ============================================================
    // SECTION 2: Settings
    // ============================================================
    await sc.from("approval_settings").upsert({ dealer_id: dealerId });
    await sc.from("notification_settings").upsert({
      dealer_id: dealerId,
      owner_email: DEMO_ADMIN_EMAIL,
      owner_phone: "01711000000",
    });
    await sc.from("whatsapp_settings").upsert({
      dealer_id: dealerId,
      prefer_manual_send: true,
      default_country_code: "880",
    });
    await sc.from("demand_planning_settings").upsert({ dealer_id: dealerId }).select().maybeSingle().then(() => {}).catch(() => {});
    lg("Settings initialized");

    // ============================================================
    // SECTION 3A: Suppliers (8)
    // ============================================================
    const supplierData = [
      { name: "RAK Ceramics BD Ltd", phone: "01711100001", contact_person: "Md. Karim", email: "sales@rakbd.com", address: "Gazipur, Dhaka", opening_balance: 45000 },
      { name: "Akij Ceramics", phone: "01711100002", contact_person: "Rahim Uddin", email: "info@akijceramics.com", address: "Dhamrai, Dhaka", opening_balance: 0 },
      { name: "Mir Ceramics", phone: "01711100003", contact_person: "Nazmul Hasan", email: "trade@mirceramics.bd", address: "Bhaluka, Mymensingh", opening_balance: 22000 },
      { name: "DBL Ceramics", phone: "01711100004", contact_person: "Tariq Aziz", email: "supply@dblceramics.com", address: "Habiganj, Sylhet", opening_balance: 0 },
      { name: "Sharif Ceramics", phone: "01711100005", contact_person: "Sharif Hossain", address: "Bhanga, Faridpur", opening_balance: 15000 },
      { name: "Star Sanitary BD", phone: "01711100006", contact_person: "Faruq Ahmed", email: "orders@starsanitary.bd", address: "Old Dhaka", opening_balance: 0 },
      { name: "Crown Sanitary Ltd", phone: "01711100007", contact_person: "Imran Khan", email: "trade@crownsanitary.com", address: "Tongi, Gazipur", opening_balance: 8500 },
      { name: "Hatim Bath Solutions", phone: "01711100008", contact_person: "Hatim Ali", address: "Chittagong", opening_balance: 0 },
    ].map((s) => ({ ...s, dealer_id: dealerId, status: "active" }));
    const { data: suppliers, error: supErr } = await sc.from("suppliers").insert(supplierData).select("id, name");
    if (supErr) throw new Error(`suppliers: ${supErr.message}`);
    summary.suppliers = suppliers!.length;
    lg(`Suppliers: ${suppliers!.length}`);

    // ============================================================
    // SECTION 3E: Pricing Tiers (4) — must exist before customers reference them
    // ============================================================
    const { data: tiers, error: tErr } = await sc.from("price_tiers").insert([
      { dealer_id: dealerId, name: "Retail", description: "Walk-in customers", is_default: true },
      { dealer_id: dealerId, name: "Dealer", description: "Wholesale dealers" },
      { dealer_id: dealerId, name: "Contractor", description: "Construction contractors" },
      { dealer_id: dealerId, name: "Project", description: "Project-based customers" },
    ]).select("id, name");
    if (tErr) throw new Error(`tiers: ${tErr.message}`);
    summary.pricing_tiers = tiers!.length;
    const tierByName = Object.fromEntries(tiers!.map((t) => [t.name, t.id]));

    // ============================================================
    // SECTION 3B: Customers (12)
    // ============================================================
    const customerData = [
      { name: "Walk-in Customer", type: "customer", phone: "01911000001", address: "Dhaka", price_tier_id: tierByName.Retail, opening_balance: 0, credit_limit: 0, max_overdue_days: 0 },
      { name: "Rahima Begum", type: "customer", phone: "01911000002", address: "Mohammadpur, Dhaka", price_tier_id: tierByName.Retail, opening_balance: 5000, credit_limit: 20000, max_overdue_days: 30 },
      { name: "Karim Tiles House", type: "retailer", phone: "01911000003", address: "Mirpur 10, Dhaka", price_tier_id: tierByName.Dealer, opening_balance: 35000, credit_limit: 200000, max_overdue_days: 45 },
      { name: "Saiful Enterprise", type: "retailer", phone: "01911000004", address: "Uttara, Dhaka", price_tier_id: tierByName.Dealer, opening_balance: 0, credit_limit: 150000, max_overdue_days: 30 },
      { name: "Hossain Construction", type: "customer", phone: "01911000005", address: "Banani, Dhaka", price_tier_id: tierByName.Contractor, opening_balance: 12000, credit_limit: 300000, max_overdue_days: 60 },
      { name: "M/s Asha Builders", type: "customer", phone: "01911000006", address: "Gulshan, Dhaka", price_tier_id: tierByName.Contractor, opening_balance: 0, credit_limit: 250000, max_overdue_days: 60 },
      { name: "Arch. Nasrin & Associates", type: "customer", phone: "01911000007", email: "nasrin.arch@example.com", address: "Dhanmondi, Dhaka", price_tier_id: tierByName.Project, opening_balance: 0, credit_limit: 500000, max_overdue_days: 90, reference_name: "Arch. Nasrin Sultana" },
      { name: "Bashundhara Heights Project", type: "project", phone: "01911000008", address: "Bashundhara R/A, Dhaka", price_tier_id: tierByName.Project, opening_balance: 0, credit_limit: 1000000, max_overdue_days: 90 },
      { name: "Lake View Apartments", type: "project", phone: "01911000009", address: "Gulshan-2, Dhaka", price_tier_id: tierByName.Project, opening_balance: 0, credit_limit: 800000, max_overdue_days: 90 },
      { name: "Md. Jamal", type: "customer", phone: "01911000010", address: "Old Dhaka", price_tier_id: tierByName.Retail, opening_balance: 0, credit_limit: 10000, max_overdue_days: 15 },
      { name: "Trinity Tiles & Sanitary", type: "retailer", phone: "01911000011", address: "Savar, Dhaka", price_tier_id: tierByName.Dealer, opening_balance: 18500, credit_limit: 180000, max_overdue_days: 45 },
      { name: "Hossain Mia", type: "customer", phone: "01911000012", address: "Narayanganj", price_tier_id: tierByName.Retail, opening_balance: 2500, credit_limit: 15000, max_overdue_days: 30 },
    ].map((c) => ({ ...c, dealer_id: dealerId, status: "active" }));
    const { data: customers, error: cErr } = await sc.from("customers").insert(customerData).select("id, name");
    if (cErr) throw new Error(`customers: ${cErr.message}`);
    summary.customers = customers!.length;
    const custByName = Object.fromEntries(customers!.map((c) => [c.name, c.id]));

    // ============================================================
    // SECTION 3C: Projects (4) and Sites (6)
    // ============================================================
    // get next project codes via RPC
    const projectsToInsert: any[] = [];
    for (const p of [
      { project_name: "Bashundhara Tower A", customer: "Bashundhara Heights Project", start_date: daysAgo(60), expected_end_date: daysAgo(-180) },
      { project_name: "Lake View Block C", customer: "Lake View Apartments", start_date: daysAgo(45), expected_end_date: daysAgo(-120) },
      { project_name: "Asha Builders Phase 2", customer: "M/s Asha Builders", start_date: daysAgo(30), expected_end_date: daysAgo(-90) },
      { project_name: "Arch Nasrin — Villa Renovation", customer: "Arch. Nasrin & Associates", start_date: daysAgo(20), expected_end_date: daysAgo(-60) },
    ]) {
      const { data: code } = await sc.rpc("get_next_project_code", { p_dealer_id: dealerId });
      projectsToInsert.push({
        dealer_id: dealerId,
        project_name: p.project_name,
        project_code: code,
        customer_id: custByName[p.customer],
        status: "active",
        start_date: p.start_date,
        expected_end_date: p.expected_end_date,
        created_by: adminId,
      });
    }
    const { data: projects, error: pErr } = await sc.from("projects").insert(projectsToInsert).select("id, project_name, customer_id");
    if (pErr) throw new Error(`projects: ${pErr.message}`);
    summary.projects = projects!.length;

    const sitesData = [
      { project: "Bashundhara Tower A", site_name: "Floor 1-5", address: "Tower A, Bashundhara R/A" },
      { project: "Bashundhara Tower A", site_name: "Floor 6-10", address: "Tower A, Bashundhara R/A" },
      { project: "Lake View Block C", site_name: "Block C - Ground", address: "Lake View, Gulshan-2" },
      { project: "Asha Builders Phase 2", site_name: "Plot 22 - Main", address: "Banani DOHS" },
      { project: "Asha Builders Phase 2", site_name: "Plot 22 - Annex", address: "Banani DOHS" },
      { project: "Arch Nasrin — Villa Renovation", site_name: "Villa - Upper Floor", address: "Dhanmondi 27" },
    ];
    const sitesInsert = sitesData.map((s) => {
      const proj = projects!.find((p) => p.project_name === s.project)!;
      return {
        dealer_id: dealerId,
        project_id: proj.id,
        customer_id: proj.customer_id,
        site_name: s.site_name,
        address: s.address,
        status: "active",
        created_by: adminId,
      };
    });
    const { data: sites, error: sErr } = await sc.from("project_sites").insert(sitesInsert).select("id, site_name, project_id, customer_id");
    if (sErr) throw new Error(`sites: ${sErr.message}`);
    summary.sites = sites!.length;
    lg(`Projects=${projects!.length} sites=${sites!.length}`);

    // ============================================================
    // SECTION 3D: Referral sources (5)
    // ============================================================
    const { data: refs } = await sc.from("referral_sources").insert([
      { dealer_id: dealerId, source_type: "salesman", name: "Demo Salesman", phone: "01911100001", default_commission_type: "percent", default_commission_value: 2 },
      { dealer_id: dealerId, source_type: "salesman", name: "Mr. Hannan", phone: "01911100002", default_commission_type: "percent", default_commission_value: 1.5 },
      { dealer_id: dealerId, source_type: "contractor", name: "Khan Contractor", phone: "01911100003", default_commission_type: "percent", default_commission_value: 3 },
      { dealer_id: dealerId, source_type: "contractor", name: "Rahman Builders", phone: "01911100004", default_commission_type: "fixed", default_commission_value: 500 },
      { dealer_id: dealerId, source_type: "architect", name: "Arch. Nasrin Sultana", phone: "01911100005", default_commission_type: "percent", default_commission_value: 5 },
    ]).select("id, name");
    summary.referrals = refs!.length;

    // ============================================================
    // SECTION 4: Products (30 = 18 tiles + 12 sanitary)
    // ============================================================
    const tileProducts = [
      { sku: "RAK-3060-GLS-MARBLE", name: "RAK Marble Glossy 30x60", brand: "RAK", size: "30x60", color: "White Marble", per_box_sft: 17.22, cost_price: 950, default_sale_rate: 1250 },
      { sku: "RAK-6060-MAT-GREY",  name: "RAK Matt Grey 60x60",     brand: "RAK", size: "60x60", color: "Charcoal Grey", per_box_sft: 25.83, cost_price: 1450, default_sale_rate: 1850 },
      { sku: "RAK-6060-GLS-IVORY", name: "RAK Glossy Ivory 60x60",  brand: "RAK", size: "60x60", color: "Ivory", per_box_sft: 25.83, cost_price: 1500, default_sale_rate: 1950 },
      { sku: "RAK-60120-MARBLE",   name: "RAK Premium Marble 60x120", brand: "RAK", size: "60x120", color: "Statuario White", per_box_sft: 51.66, cost_price: 3200, default_sale_rate: 4200 },
      { sku: "AKIJ-3060-GLS-BLUE", name: "Akij Glossy Blue 30x60",  brand: "Akij", size: "30x60", color: "Ocean Blue", per_box_sft: 17.22, cost_price: 720, default_sale_rate: 980 },
      { sku: "AKIJ-6060-MAT-BEIGE",name: "Akij Matt Beige 60x60",   brand: "Akij", size: "60x60", color: "Beige", per_box_sft: 25.83, cost_price: 1100, default_sale_rate: 1450 },
      { sku: "AKIJ-6060-GLS-WOOD", name: "Akij Wood-Look 60x60",    brand: "Akij", size: "60x60", color: "Walnut", per_box_sft: 25.83, cost_price: 1250, default_sale_rate: 1650 },
      { sku: "AKIJ-80120-MARBLE",  name: "Akij Royal Marble 80x120", brand: "Akij", size: "80x120", color: "Royal White", per_box_sft: 68.89, cost_price: 4200, default_sale_rate: 5500 },
      { sku: "MIR-3060-MAT-WHT",   name: "Mir Matt White 30x60",    brand: "Mir", size: "30x60", color: "Pure White", per_box_sft: 17.22, cost_price: 680, default_sale_rate: 950 },
      { sku: "MIR-6060-GLS-CRM",   name: "Mir Glossy Cream 60x60",  brand: "Mir", size: "60x60", color: "Cream", per_box_sft: 25.83, cost_price: 1080, default_sale_rate: 1400 },
      { sku: "MIR-6060-MARBLE-BG", name: "Mir Marble Beige 60x60",  brand: "Mir", size: "60x60", color: "Marble Beige", per_box_sft: 25.83, cost_price: 1180, default_sale_rate: 1550 },
      { sku: "MIR-60120-WOOD",     name: "Mir Wood Plank 60x120",   brand: "Mir", size: "60x120", color: "Oak", per_box_sft: 51.66, cost_price: 2900, default_sale_rate: 3850 },
      { sku: "DBL-3060-GLS-BLK",   name: "DBL Glossy Black 30x60",  brand: "DBL", size: "30x60", color: "Jet Black", per_box_sft: 17.22, cost_price: 800, default_sale_rate: 1100 },
      { sku: "DBL-6060-MAT-SAND",  name: "DBL Matt Sandstone 60x60",brand: "DBL", size: "60x60", color: "Sandstone", per_box_sft: 25.83, cost_price: 1320, default_sale_rate: 1750 },
      { sku: "DBL-60120-MARBLE-W", name: "DBL Marble Wave 60x120",  brand: "DBL", size: "60x120", color: "Wave White", per_box_sft: 51.66, cost_price: 3050, default_sale_rate: 4000 },
      { sku: "DBL-80120-LUXURY",   name: "DBL Luxury Onyx 80x120",  brand: "DBL", size: "80x120", color: "Onyx Gold", per_box_sft: 68.89, cost_price: 4800, default_sale_rate: 6200 },
      { sku: "SHRF-3060-GLS-PNK",  name: "Sharif Glossy Pink 30x60",brand: "Sharif", size: "30x60", color: "Soft Pink", per_box_sft: 17.22, cost_price: 620, default_sale_rate: 880 },
      { sku: "SHRF-6060-WOOD-DARK",name: "Sharif Wood Dark 60x60",  brand: "Sharif", size: "60x60", color: "Dark Walnut", per_box_sft: 25.83, cost_price: 980, default_sale_rate: 1300 },
    ].map((p, i) => ({
      ...p,
      dealer_id: dealerId,
      category: "tiles" as const,
      unit_type: "box_sft" as const,
      reorder_level: 5,
      active: true,
      material: "Ceramic",
    }));

    const sanitaryProducts = [
      { sku: "STAR-WB-001", name: "Star Wash Basin Standard", brand: "Star", color: "White", cost_price: 1800, default_sale_rate: 2400 },
      { sku: "STAR-WB-002", name: "Star Wash Basin Premium",  brand: "Star", color: "Ivory", cost_price: 2600, default_sale_rate: 3500 },
      { sku: "CRWN-CMD-001",name: "Crown Commode Single Flush",brand: "Crown", color: "White", cost_price: 5500, default_sale_rate: 7200 },
      { sku: "CRWN-CMD-002",name: "Crown Commode Dual Flush",  brand: "Crown", color: "White", cost_price: 7200, default_sale_rate: 9500 },
      { sku: "CRWN-CMD-003",name: "Crown Premium Wall-Hung Commode", brand: "Crown", color: "White", cost_price: 12500, default_sale_rate: 16500 },
      { sku: "HATIM-FCT-01",name: "Hatim Pillar Cock Faucet",  brand: "Hatim", color: "Chrome", cost_price: 850, default_sale_rate: 1200 },
      { sku: "HATIM-FCT-02",name: "Hatim Long Body Mixer",      brand: "Hatim", color: "Chrome", cost_price: 2200, default_sale_rate: 2950 },
      { sku: "HATIM-FCT-03",name: "Hatim Sensor Faucet",        brand: "Hatim", color: "Chrome", cost_price: 4800, default_sale_rate: 6500 },
      { sku: "HATIM-SHW-01",name: "Hatim Shower Set Basic",     brand: "Hatim", color: "Chrome", cost_price: 1850, default_sale_rate: 2500 },
      { sku: "HATIM-SHW-02",name: "Hatim Rainfall Shower Premium", brand: "Hatim", color: "Chrome", cost_price: 5500, default_sale_rate: 7400 },
      { sku: "STAR-ACC-01", name: "Star Towel Rail",            brand: "Star", color: "Chrome", cost_price: 480, default_sale_rate: 680 },
      { sku: "STAR-ACC-02", name: "Star Soap Dispenser",        brand: "Star", color: "Chrome", cost_price: 320, default_sale_rate: 480 },
    ].map((p) => ({
      ...p,
      dealer_id: dealerId,
      category: "sanitary" as const,
      unit_type: "piece" as const,
      reorder_level: 3,
      active: true,
    }));

    const { data: products, error: prErr } = await sc.from("products").insert([...tileProducts, ...sanitaryProducts]).select("id, sku, name, unit_type, per_box_sft, cost_price, default_sale_rate, category, brand");
    if (prErr) throw new Error(`products: ${prErr.message}`);
    summary.products = products!.length;
    lg(`Products: ${products!.length}`);
    const productBySku = Object.fromEntries(products!.map((p) => [p.sku, p]));

    // Initialize stock rows
    const stockRows = products!.map((p) => ({
      dealer_id: dealerId,
      product_id: p.id,
      box_qty: 0, piece_qty: 0, sft_qty: 0, average_cost_per_unit: p.cost_price,
    }));
    await sc.from("stock").insert(stockRows);

    // Pricing tier overrides — give Dealer tier ~7% discount on tiles, Project tier ~12% off
    const tierItemsRows: any[] = [];
    for (const p of products!) {
      tierItemsRows.push({ dealer_id: dealerId, tier_id: tierByName.Dealer, product_id: p.id, rate: Math.round(p.default_sale_rate * 0.93) });
      tierItemsRows.push({ dealer_id: dealerId, tier_id: tierByName.Contractor, product_id: p.id, rate: Math.round(p.default_sale_rate * 0.90) });
      tierItemsRows.push({ dealer_id: dealerId, tier_id: tierByName.Project, product_id: p.id, rate: Math.round(p.default_sale_rate * 0.88) });
    }
    await sc.from("price_tier_items").insert(tierItemsRows);
    lg(`Price tier overrides: ${tierItemsRows.length}`);

    // ============================================================
    // SECTION 5: Purchases + Batches + Stock
    // 10 purchases, varied dates, varied suppliers, populating stock.
    // We insert purchase + items, create batches for tiles, update stock manually here.
    // ============================================================
    const supByName = Object.fromEntries(suppliers!.map((s) => [s.name, s.id]));
    const purchasePlan: Array<{ supplier: string; daysAgo: number; items: Array<{ sku: string; qty: number; rate: number; batchSuffix?: string; shade?: string }> }> = [
      { supplier: "RAK Ceramics BD Ltd", daysAgo: 60, items: [
        { sku: "RAK-3060-GLS-MARBLE", qty: 80, rate: 950, batchSuffix: "L1", shade: "S101" },
        { sku: "RAK-6060-MAT-GREY", qty: 60, rate: 1450, batchSuffix: "L1", shade: "S202" },
        { sku: "RAK-60120-MARBLE", qty: 25, rate: 3200, batchSuffix: "L1", shade: "S303" },
      ]},
      { supplier: "RAK Ceramics BD Ltd", daysAgo: 30, items: [
        { sku: "RAK-3060-GLS-MARBLE", qty: 40, rate: 970, batchSuffix: "L2", shade: "S101" },
        { sku: "RAK-6060-GLS-IVORY", qty: 50, rate: 1500, batchSuffix: "L1", shade: "S204" },
      ]},
      { supplier: "Akij Ceramics", daysAgo: 50, items: [
        { sku: "AKIJ-3060-GLS-BLUE", qty: 70, rate: 720, batchSuffix: "L1", shade: "B101" },
        { sku: "AKIJ-6060-MAT-BEIGE", qty: 55, rate: 1100, batchSuffix: "L1", shade: "B202" },
        { sku: "AKIJ-6060-GLS-WOOD", qty: 45, rate: 1250, batchSuffix: "L1", shade: "B303" },
        { sku: "AKIJ-80120-MARBLE", qty: 15, rate: 4200, batchSuffix: "L1", shade: "B404" },
      ]},
      { supplier: "Mir Ceramics", daysAgo: 45, items: [
        { sku: "MIR-3060-MAT-WHT", qty: 90, rate: 680, batchSuffix: "L1", shade: "M101" },
        { sku: "MIR-6060-GLS-CRM", qty: 55, rate: 1080, batchSuffix: "L1", shade: "M202" },
        { sku: "MIR-6060-MARBLE-BG", qty: 60, rate: 1180, batchSuffix: "L1", shade: "M203" },
      ]},
      { supplier: "Mir Ceramics", daysAgo: 15, items: [
        { sku: "MIR-60120-WOOD", qty: 30, rate: 2900, batchSuffix: "L1", shade: "M404" },
      ]},
      { supplier: "DBL Ceramics", daysAgo: 40, items: [
        { sku: "DBL-3060-GLS-BLK", qty: 50, rate: 800, batchSuffix: "L1", shade: "D101" },
        { sku: "DBL-6060-MAT-SAND", qty: 45, rate: 1320, batchSuffix: "L1", shade: "D202" },
        { sku: "DBL-60120-MARBLE-W", qty: 28, rate: 3050, batchSuffix: "L1", shade: "D303" },
        { sku: "DBL-80120-LUXURY", qty: 12, rate: 4800, batchSuffix: "L1", shade: "D404" },
      ]},
      { supplier: "Sharif Ceramics", daysAgo: 35, items: [
        { sku: "SHRF-3060-GLS-PNK", qty: 40, rate: 620, batchSuffix: "L1", shade: "SH101" },
        { sku: "SHRF-6060-WOOD-DARK", qty: 35, rate: 980, batchSuffix: "L1", shade: "SH202" },
      ]},
      { supplier: "Star Sanitary BD", daysAgo: 25, items: [
        { sku: "STAR-WB-001", qty: 30, rate: 1800 },
        { sku: "STAR-WB-002", qty: 18, rate: 2600 },
        { sku: "STAR-ACC-01", qty: 50, rate: 480 },
        { sku: "STAR-ACC-02", qty: 40, rate: 320 },
      ]},
      { supplier: "Crown Sanitary Ltd", daysAgo: 20, items: [
        { sku: "CRWN-CMD-001", qty: 25, rate: 5500 },
        { sku: "CRWN-CMD-002", qty: 18, rate: 7200 },
        { sku: "CRWN-CMD-003", qty: 8, rate: 12500 },
      ]},
      { supplier: "Hatim Bath Solutions", daysAgo: 10, items: [
        { sku: "HATIM-FCT-01", qty: 60, rate: 850 },
        { sku: "HATIM-FCT-02", qty: 35, rate: 2200 },
        { sku: "HATIM-FCT-03", qty: 12, rate: 4800 },
        { sku: "HATIM-SHW-01", qty: 28, rate: 1850 },
        { sku: "HATIM-SHW-02", qty: 15, rate: 5500 },
      ]},
    ];

    let purchaseCount = 0;
    let batchCount = 0;
    for (let i = 0; i < purchasePlan.length; i++) {
      const pp = purchasePlan[i];
      const purchaseDate = daysAgo(pp.daysAgo);
      const totalAmount = pp.items.reduce((s, it) => s + it.qty * it.rate, 0);
      const { data: purchase, error: pErr2 } = await sc.from("purchases").insert({
        dealer_id: dealerId,
        supplier_id: supByName[pp.supplier],
        invoice_number: `PUR-${(i + 1).toString().padStart(4, "0")}`,
        purchase_date: purchaseDate,
        total_amount: totalAmount,
        notes: `Demo purchase from ${pp.supplier}`,
        created_by: adminId,
      }).select("id").single();
      if (pErr2) throw new Error(`purchase ${i}: ${pErr2.message}`);
      purchaseCount++;

      const itemRows: any[] = [];
      for (const it of pp.items) {
        const prod = productBySku[it.sku];
        if (!prod) continue;
        let batchId: string | null = null;
        if (prod.unit_type === "box_sft" && it.batchSuffix) {
          const batchNo = `${it.sku}-${purchaseDate.replace(/-/g, "")}-${it.batchSuffix}`;
          const { data: batch } = await sc.from("product_batches").insert({
            dealer_id: dealerId,
            product_id: prod.id,
            batch_no: batchNo,
            shade_code: it.shade || null,
            caliber: "C1",
            box_qty: it.qty,
            piece_qty: 0,
            sft_qty: it.qty * Number(prod.per_box_sft || 0),
            status: "active",
          }).select("id").single();
          if (batch) { batchId = batch.id; batchCount++; }
        }
        const totalSft = prod.unit_type === "box_sft" ? it.qty * Number(prod.per_box_sft || 0) : null;
        itemRows.push({
          purchase_id: purchase.id,
          dealer_id: dealerId,
          product_id: prod.id,
          quantity: it.qty,
          purchase_rate: it.rate,
          total: it.qty * it.rate,
          landed_cost: it.rate,
          total_sft: totalSft,
          batch_id: batchId,
        });
      }
      await sc.from("purchase_items").insert(itemRows);

      // Update stock aggregates
      for (const it of pp.items) {
        const prod = productBySku[it.sku];
        if (!prod) continue;
        if (prod.unit_type === "box_sft") {
          await sc.rpc("touch_dummy", {}).catch(() => {});
          const { data: cur } = await sc.from("stock").select("box_qty, sft_qty").eq("dealer_id", dealerId).eq("product_id", prod.id).single();
          await sc.from("stock").update({
            box_qty: Number(cur!.box_qty) + it.qty,
            sft_qty: (Number(cur!.box_qty) + it.qty) * Number(prod.per_box_sft || 0),
            average_cost_per_unit: it.rate,
          }).eq("dealer_id", dealerId).eq("product_id", prod.id);
        } else {
          const { data: cur } = await sc.from("stock").select("piece_qty").eq("dealer_id", dealerId).eq("product_id", prod.id).single();
          await sc.from("stock").update({
            piece_qty: Number(cur!.piece_qty) + it.qty,
            average_cost_per_unit: it.rate,
          }).eq("dealer_id", dealerId).eq("product_id", prod.id);
        }
      }

      // supplier ledger entry: purchase increases payable (positive)
      await sc.from("supplier_ledger").insert({
        dealer_id: dealerId,
        supplier_id: supByName[pp.supplier],
        purchase_id: purchase.id,
        type: "purchase",
        amount: totalAmount,
        description: `Purchase ${purchase.id.slice(0, 8)}`,
        entry_date: purchaseDate,
      });
    }
    summary.purchases = purchaseCount;
    summary.batches = batchCount;
    lg(`Purchases=${purchaseCount} batches=${batchCount}`);

    // Now intentionally drain stock for some products so dashboard shows low/zero stock alerts
    // Drain MIR-60120-WOOD to near zero, SHRF-3060-GLS-PNK to half, leave HATIM-FCT-03 low
    // (not by inserting fake sales — just by adjusting stock with audit)
    const drainPlan = [
      { sku: "SHRF-3060-GLS-PNK", remainingBox: 4 },
      { sku: "MIR-60120-WOOD", remainingBox: 2 },
      { sku: "HATIM-FCT-03", remainingPiece: 2 },
    ];
    for (const d of drainPlan) {
      const prod = productBySku[d.sku];
      if (!prod) continue;
      if (prod.unit_type === "box_sft" && d.remainingBox !== undefined) {
        await sc.from("stock").update({
          box_qty: d.remainingBox,
          sft_qty: d.remainingBox * Number(prod.per_box_sft || 0),
        }).eq("dealer_id", dealerId).eq("product_id", prod.id);
      } else if (d.remainingPiece !== undefined) {
        await sc.from("stock").update({ piece_qty: d.remainingPiece }).eq("dealer_id", dealerId).eq("product_id", prod.id);
      }
    }

    // ============================================================
    // SECTION 6A: Quotations (8) — using sequence RPC
    // ============================================================
    const quotationsPlan = [
      { customer: "Karim Tiles House", days: 12, status: "draft" },
      { customer: "Saiful Enterprise", days: 10, status: "active" },
      { customer: "Hossain Construction", days: 8, status: "active" },
      { customer: "Bashundhara Heights Project", days: 7, status: "active", project: "Bashundhara Tower A" },
      { customer: "Lake View Apartments", days: 6, status: "revised", project: "Lake View Block C" },
      { customer: "M/s Asha Builders", days: 5, status: "converted", project: "Asha Builders Phase 2" },
      { customer: "Arch. Nasrin & Associates", days: 4, status: "active", project: "Arch Nasrin — Villa Renovation" },
      { customer: "Trinity Tiles & Sanitary", days: 2, status: "draft" },
    ];
    let quotationCount = 0;
    for (let i = 0; i < quotationsPlan.length; i++) {
      const q = quotationsPlan[i];
      const { data: qno } = await sc.rpc("generate_next_quotation_no", { _dealer_id: dealerId });
      const tierId = tierByName[q.project ? "Project" : "Dealer"];
      const productPicks = [products![i % products!.length], products![(i + 5) % products!.length], products![(i + 11) % products!.length]];
      let subtotal = 0;
      const items = productPicks.map((prod, idx) => {
        const qty = prod.unit_type === "box_sft" ? (5 + idx * 2) : (3 + idx);
        const rate = Math.round(Number(prod.default_sale_rate) * 0.92);
        const lineTotal = qty * rate;
        subtotal += lineTotal;
        return {
          dealer_id: dealerId,
          product_id: prod.id,
          product_name_snapshot: prod.name,
          product_sku_snapshot: prod.sku,
          unit_type: prod.unit_type,
          per_box_sft: prod.per_box_sft,
          quantity: qty,
          rate,
          line_total: lineTotal,
          tier_id: tierId,
          rate_source: "tier",
          sort_order: idx,
        };
      });
      const projObj = q.project ? projects!.find((p) => p.project_name === q.project) : null;
      const { data: quotation } = await sc.from("quotations").insert({
        dealer_id: dealerId,
        quotation_no: qno,
        customer_id: custByName[q.customer],
        status: q.status,
        quote_date: daysAgo(q.days),
        valid_until: daysAgo(q.days - 14),
        subtotal,
        total_amount: subtotal,
        project_id: projObj?.id || null,
        created_by: adminId,
      }).select("id").single();
      if (!quotation) continue;
      const itemsWithQid = items.map((it) => ({ ...it, quotation_id: quotation.id }));
      await sc.from("quotation_items").insert(itemsWithQid);
      quotationCount++;
    }
    summary.quotations = quotationCount;
    lg(`Quotations=${quotationCount}`);

    // ============================================================
    // SECTION 6B: Sales (12) — uses RPCs for invoice_no + batch allocation
    // ============================================================
    // We pre-snapshot per-product cost from average_cost_per_unit (already set above)
    const salesPlan: Array<{
      customer: string; days: number; project?: string; site?: string;
      paymentMode: "cash" | "bank" | "mobile_banking"; payRatio: number;
      tier?: "Retail" | "Dealer" | "Contractor" | "Project";
      referral?: string;
      items: Array<{ sku: string; qty: number }>;
      backorder?: boolean;
    }> = [
      { customer: "Walk-in Customer", days: 18, paymentMode: "cash", payRatio: 1.0, tier: "Retail", items: [{ sku: "RAK-3060-GLS-MARBLE", qty: 3 }, { sku: "STAR-WB-001", qty: 1 }] },
      { customer: "Rahima Begum", days: 16, paymentMode: "cash", payRatio: 1.0, tier: "Retail", items: [{ sku: "AKIJ-3060-GLS-BLUE", qty: 4 }, { sku: "HATIM-FCT-01", qty: 2 }] },
      { customer: "Karim Tiles House", days: 14, paymentMode: "bank", payRatio: 0.5, tier: "Dealer", items: [{ sku: "RAK-6060-MAT-GREY", qty: 8 }, { sku: "MIR-3060-MAT-WHT", qty: 12 }] },
      { customer: "Saiful Enterprise", days: 12, paymentMode: "bank", payRatio: 0.7, tier: "Dealer", items: [{ sku: "AKIJ-6060-MAT-BEIGE", qty: 10 }, { sku: "DBL-6060-MAT-SAND", qty: 6 }] },
      { customer: "Hossain Construction", days: 10, paymentMode: "bank", payRatio: 0.3, tier: "Contractor", referral: "Khan Contractor", items: [{ sku: "MIR-6060-MARBLE-BG", qty: 15 }, { sku: "DBL-60120-MARBLE-W", qty: 5 }] },
      { customer: "Bashundhara Heights Project", days: 9, project: "Bashundhara Tower A", site: "Floor 1-5", paymentMode: "bank", payRatio: 0.4, tier: "Project", items: [{ sku: "RAK-60120-MARBLE", qty: 8 }, { sku: "CRWN-CMD-002", qty: 6 }] },
      { customer: "Lake View Apartments", days: 8, project: "Lake View Block C", site: "Block C - Ground", paymentMode: "bank", payRatio: 0.0, tier: "Project", items: [{ sku: "AKIJ-80120-MARBLE", qty: 4 }, { sku: "HATIM-SHW-02", qty: 4 }] },
      { customer: "M/s Asha Builders", days: 6, project: "Asha Builders Phase 2", site: "Plot 22 - Main", paymentMode: "bank", payRatio: 0.6, tier: "Contractor", referral: "Rahman Builders", items: [{ sku: "DBL-80120-LUXURY", qty: 3 }, { sku: "CRWN-CMD-003", qty: 2 }] },
      { customer: "Arch. Nasrin & Associates", days: 5, project: "Arch Nasrin — Villa Renovation", site: "Villa - Upper Floor", paymentMode: "mobile_banking", payRatio: 1.0, tier: "Project", referral: "Arch. Nasrin Sultana", items: [{ sku: "RAK-6060-GLS-IVORY", qty: 6 }, { sku: "HATIM-SHW-01", qty: 2 }] },
      { customer: "Md. Jamal", days: 3, paymentMode: "cash", payRatio: 1.0, tier: "Retail", items: [{ sku: "STAR-ACC-01", qty: 2 }, { sku: "STAR-ACC-02", qty: 1 }] },
      { customer: "Trinity Tiles & Sanitary", days: 2, paymentMode: "bank", payRatio: 0.5, tier: "Dealer", items: [{ sku: "MIR-6060-GLS-CRM", qty: 6 }, { sku: "AKIJ-6060-GLS-WOOD", qty: 4 }] },
      // Backorder: try to sell more than available of SHRF-3060-GLS-PNK (drained to 4 boxes)
      { customer: "Hossain Mia", days: 1, paymentMode: "cash", payRatio: 0.3, tier: "Retail", backorder: true, items: [{ sku: "SHRF-3060-GLS-PNK", qty: 6 }] },
    ];

    const refByName = Object.fromEntries(refs!.map((r) => [r.name, r.id]));
    let saleCount = 0;
    const createdSales: Array<{ id: string; invoice_number: string; customer: string; total: number; due: number; days: number; project?: string; site?: string }> = [];
    let backorderSaleId: string | null = null;

    for (let i = 0; i < salesPlan.length; i++) {
      const sp = salesPlan[i];
      const { data: invNo } = await sc.rpc("generate_next_invoice_no", { _dealer_id: dealerId });
      const tierId = sp.tier ? tierByName[sp.tier] : null;

      // Build items: pull current stock to decide backorder
      let total = 0, totalBox = 0, totalSft = 0, totalPiece = 0, cogs = 0;
      const itemsResolved = [];
      let hasBackorder = false;
      for (const it of sp.items) {
        const prod = productBySku[it.sku];
        const { data: stockRow } = await sc.from("stock").select("box_qty, piece_qty, average_cost_per_unit").eq("dealer_id", dealerId).eq("product_id", prod.id).single();
        const available = prod.unit_type === "box_sft" ? Number(stockRow!.box_qty) : Number(stockRow!.piece_qty);
        let backorderQty = 0;
        if (it.qty > available) {
          backorderQty = it.qty - available;
          hasBackorder = true;
        }
        // resolve rate: tier override if exists else default
        let rate = Number(prod.default_sale_rate);
        if (tierId) {
          const { data: tierRow } = await sc.from("price_tier_items").select("rate").eq("tier_id", tierId).eq("product_id", prod.id).maybeSingle();
          if (tierRow) rate = Number(tierRow.rate);
        }
        const lineTotal = it.qty * rate;
        const lineSft = prod.unit_type === "box_sft" ? it.qty * Number(prod.per_box_sft || 0) : null;
        total += lineTotal;
        if (prod.unit_type === "box_sft") { totalBox += it.qty; totalSft += lineSft || 0; }
        else { totalPiece += it.qty; }
        cogs += it.qty * Number(stockRow!.average_cost_per_unit);
        itemsResolved.push({
          product: prod, qty: it.qty, rate, lineTotal, lineSft,
          available_qty_at_sale: available, backorderQty, tierId,
        });
      }

      const paid = Math.round(total * sp.payRatio);
      const due = total - paid;
      const profit = total - cogs;
      const projObj = sp.project ? projects!.find((p) => p.project_name === sp.project) : null;
      const siteObj = sp.site ? sites!.find((s) => s.site_name === sp.site) : null;

      const { data: sale, error: saleErr } = await sc.from("sales").insert({
        dealer_id: dealerId,
        customer_id: custByName[sp.customer],
        invoice_number: invNo,
        sale_date: daysAgo(sp.days),
        total_amount: total,
        paid_amount: paid,
        due_amount: due,
        cogs, profit, gross_profit: profit, net_profit: profit,
        total_box: totalBox, total_sft: totalSft, total_piece: totalPiece,
        payment_mode: sp.paymentMode,
        sale_type: "direct_invoice",
        sale_status: "invoiced",
        has_backorder: hasBackorder,
        project_id: projObj?.id || null,
        site_id: siteObj?.id || null,
        client_reference: sp.referral || null,
        created_by: adminId,
      }).select("id").single();
      if (saleErr) { lg(`sale ${i} err: ${saleErr.message}`); continue; }
      saleCount++;
      if (hasBackorder) backorderSaleId = sale.id;

      // Insert sale_items + allocate batches
      for (const ir of itemsResolved) {
        const fulfillQty = Math.min(ir.qty, ir.available_qty_at_sale);
        const { data: si } = await sc.from("sale_items").insert({
          sale_id: sale.id,
          dealer_id: dealerId,
          product_id: ir.product.id,
          quantity: ir.qty,
          sale_rate: ir.rate,
          total: ir.lineTotal,
          total_sft: ir.lineSft,
          available_qty_at_sale: ir.available_qty_at_sale,
          backorder_qty: ir.backorderQty,
          allocated_qty: 0,
          fulfillment_status: ir.backorderQty > 0 ? "partial" : "fulfilled",
          rate_source: ir.tierId ? "tier" : "default",
          tier_id: ir.tierId,
        }).select("id").single();
        if (!si) continue;

        if (fulfillQty > 0) {
          if (ir.product.unit_type === "box_sft") {
            // Pull active batches FIFO
            const { data: batches } = await sc.from("product_batches")
              .select("id, box_qty")
              .eq("dealer_id", dealerId)
              .eq("product_id", ir.product.id)
              .eq("status", "active")
              .order("created_at", { ascending: true });
            let remaining = fulfillQty;
            const allocs: Array<{ batch_id: string; allocated_qty: number }> = [];
            for (const b of batches || []) {
              if (remaining <= 0) break;
              const take = Math.min(remaining, Number(b.box_qty));
              if (take > 0) { allocs.push({ batch_id: b.id, allocated_qty: take }); remaining -= take; }
            }
            if (allocs.length > 0) {
              await sc.rpc("allocate_sale_batches", {
                _dealer_id: dealerId,
                _sale_item_id: si.id,
                _product_id: ir.product.id,
                _unit_type: "box_sft",
                _per_box_sft: Number(ir.product.per_box_sft || 0),
                _allocations: allocs,
              });
            }
          } else {
            await sc.rpc("deduct_stock_unbatched", {
              _product_id: ir.product.id,
              _dealer_id: dealerId,
              _unit_type: "piece",
              _per_box_sft: 0,
              _quantity: fulfillQty,
            });
            await sc.from("sale_items").update({ allocated_qty: fulfillQty }).eq("id", si.id);
          }
        }
      }

      // Customer ledger: sale + payment
      const ledgerRows: any[] = [{
        dealer_id: dealerId, customer_id: custByName[sp.customer],
        sale_id: sale.id, type: "sale", amount: total,
        description: `Invoice ${invNo}`, entry_date: daysAgo(sp.days),
      }];
      if (paid > 0) {
        ledgerRows.push({
          dealer_id: dealerId, customer_id: custByName[sp.customer],
          sale_id: sale.id, type: "payment", amount: paid,
          description: `Payment for ${invNo} via ${sp.paymentMode}`,
          entry_date: daysAgo(sp.days),
        });
      }
      await sc.from("customer_ledger").insert(ledgerRows);

      // Cash ledger if cash payment
      if (paid > 0 && sp.paymentMode === "cash") {
        await sc.from("cash_ledger").insert({
          dealer_id: dealerId, type: "receipt", amount: paid,
          description: `Cash from ${sp.customer} for ${invNo}`,
          reference_type: "sale", reference_id: sale.id,
          entry_date: daysAgo(sp.days),
        });
      }

      // Commission if referral
      if (sp.referral && refByName[sp.referral]) {
        const { data: refRow } = await sc.from("referral_sources").select("default_commission_type, default_commission_value").eq("id", refByName[sp.referral]).single();
        const ctype = refRow?.default_commission_type || "percent";
        const cval = Number(refRow?.default_commission_value || 0);
        const calc = ctype === "percent" ? (total * cval / 100) : cval;
        await sc.from("sale_commissions").insert({
          dealer_id: dealerId, sale_id: sale.id, referral_source_id: refByName[sp.referral],
          commission_type: ctype, commission_value: cval,
          commission_base_amount: total, calculated_commission_amount: calc,
          status: "earned", created_by: adminId,
        });
      }

      createdSales.push({ id: sale.id, invoice_number: invNo, customer: sp.customer, total, due, days: sp.days, project: sp.project, site: sp.site });
    }
    summary.sales = saleCount;
    lg(`Sales=${saleCount}`);

    // ============================================================
    // SECTION 6C: Challans (8) + Deliveries (6)
    // First 8 sales get challans; first 6 of those also get deliveries (some partial)
    // ============================================================
    let challanCount = 0;
    let deliveryCount = 0;
    const challansCreated: Array<{ id: string; sale_id: string }> = [];
    for (let i = 0; i < Math.min(8, createdSales.length); i++) {
      const sale = createdSales[i];
      const { data: chNo } = await sc.rpc("generate_next_challan_no", { _dealer_id: dealerId });
      const projObj = sale.project ? projects!.find((p) => p.project_name === sale.project) : null;
      const siteObj = sale.site ? sites!.find((s) => s.site_name === sale.site) : null;
      const { data: ch } = await sc.from("challans").insert({
        dealer_id: dealerId, sale_id: sale.id, challan_no: chNo,
        challan_date: daysAgo(sale.days),
        driver_name: pick(["Rafiq Driver", "Sohel Driver", "Kamal Driver"], i),
        transport_name: pick(["Star Trans", "City Logistics", "Quick Move"], i),
        vehicle_no: `DHA-${(1000 + i)}`,
        status: i < 6 ? "delivered" : "pending",
        delivery_status: i < 6 ? "delivered" : "pending",
        project_id: projObj?.id || null,
        site_id: siteObj?.id || null,
        created_by: adminId,
      }).select("id").single();
      if (!ch) continue;
      challanCount++;
      challansCreated.push({ id: ch.id, sale_id: sale.id });
    }
    summary.challans = challanCount;

    for (let i = 0; i < Math.min(6, challansCreated.length); i++) {
      const ch = challansCreated[i];
      const sale = createdSales.find((s) => s.id === ch.sale_id)!;
      const projObj = sale.project ? projects!.find((p) => p.project_name === sale.project) : null;
      const siteObj = sale.site ? sites!.find((s) => s.site_name === sale.site) : null;
      const { data: del } = await sc.from("deliveries").insert({
        dealer_id: dealerId, challan_id: ch.id, sale_id: ch.sale_id,
        delivery_date: daysAgo(Math.max(0, sale.days - 1)),
        status: i < 4 ? "delivered" : "in_transit",
        receiver_name: pick(["Receiver A", "Site Manager", "Foreman"], i),
        delivery_no: `DEL-${(1000 + i)}`,
        project_id: projObj?.id || null,
        site_id: siteObj?.id || null,
        created_by: adminId,
      }).select("id").single();
      if (!del) continue;
      deliveryCount++;
      // delivery_items: copy from sale_items at full or partial qty (last 2 partial)
      const { data: saleItems } = await sc.from("sale_items").select("id, product_id, quantity, allocated_qty").eq("sale_id", ch.sale_id);
      for (const si of saleItems || []) {
        const fullQty = Number(si.allocated_qty || si.quantity);
        const deliverQty = i >= 4 ? Math.ceil(fullQty / 2) : fullQty;
        if (deliverQty <= 0) continue;
        await sc.from("delivery_items").insert({
          delivery_id: del.id, sale_item_id: si.id, product_id: si.product_id,
          dealer_id: dealerId, quantity: deliverQty,
        });
      }
    }
    summary.deliveries = deliveryCount;
    lg(`Challans=${challanCount} deliveries=${deliveryCount}`);

    // ============================================================
    // SECTION 7: Special features
    // ============================================================
    // 7a. Stock reservation (use RPC)
    let reservationCount = 0;
    try {
      // Reserve some RAK-6060-GLS-IVORY for Hossain Construction
      const reserveProd = productBySku["RAK-6060-GLS-IVORY"];
      const { data: ivoryBatch } = await sc.from("product_batches").select("id").eq("dealer_id", dealerId).eq("product_id", reserveProd.id).eq("status", "active").limit(1).maybeSingle();
      await sc.rpc("create_stock_reservation", {
        _dealer_id: dealerId, _product_id: reserveProd.id,
        _batch_id: ivoryBatch?.id || null,
        _customer_id: custByName["Hossain Construction"],
        _qty: 5, _unit_type: "box_sft",
        _reason: "Reserved pending site delivery date",
        _expires_at: daysAgo(-7), _created_by: adminId,
      });
      reservationCount++;
    } catch (e) { lg(`reservation skip: ${(e as Error).message}`); }
    summary.reservations = reservationCount;

    // 7b. Backorder allocation (link backorder sale to a future purchase)
    if (backorderSaleId) {
      try {
        const { data: bsItems } = await sc.from("sale_items").select("id, product_id, backorder_qty").eq("sale_id", backorderSaleId).gt("backorder_qty", 0);
        if (bsItems && bsItems.length > 0) {
          const it = bsItems[0];
          // create a small future-dated purchase to allocate against
          const { data: fpurchase } = await sc.from("purchases").insert({
            dealer_id: dealerId, supplier_id: supByName["Sharif Ceramics"],
            invoice_number: `PUR-FUTURE-${Date.now().toString().slice(-6)}`,
            purchase_date: daysAgo(-3), total_amount: 5000,
            notes: "Demo: incoming stock for backorder allocation",
            created_by: adminId,
          }).select("id").single();
          const { data: fpi } = await sc.from("purchase_items").insert({
            purchase_id: fpurchase!.id, dealer_id: dealerId,
            product_id: it.product_id, quantity: 10, purchase_rate: 620,
            total: 6200, landed_cost: 620,
          }).select("id").single();
          await sc.from("backorder_allocations").insert({
            dealer_id: dealerId, sale_item_id: it.id,
            purchase_item_id: fpi!.id, product_id: it.product_id,
            allocated_qty: Number(it.backorder_qty),
          });
          summary.backorder_allocations = 1;
        }
      } catch (e) { lg(`backorder alloc skip: ${(e as Error).message}`); }
    }

    // 7c. Display stock + sample issue
    try {
      const dispProd = productBySku["RAK-60120-MARBLE"];
      await sc.from("display_stock").insert({
        dealer_id: dealerId, product_id: dispProd.id,
        display_qty: 2, notes: "Showroom display piece",
      });
      const sampleProd = productBySku["MIR-6060-MARBLE-BG"];
      await sc.from("sample_issues").insert({
        dealer_id: dealerId, product_id: sampleProd.id,
        quantity: 3, recipient_type: "architect",
        recipient_name: "Arch. Nasrin Sultana", recipient_phone: "01911100005",
        customer_id: custByName["Arch. Nasrin & Associates"],
        issue_date: daysAgo(7), expected_return_date: daysAgo(-7),
        status: "issued", created_by: adminId,
      });
      summary.display_and_samples = 2;
    } catch (e) { lg(`display/sample skip: ${(e as Error).message}`); }

    // 7d. Approval request (sample pending)
    try {
      await sc.from("approval_requests").insert({
        dealer_id: dealerId, approval_type: "credit_override",
        action_hash: "demo_hash_credit_override_001",
        context_data: { customer: "Hossain Construction", over_limit_by: 25000 },
        reason: "Customer needs to exceed credit limit for urgent project order",
        source_type: "sale", requested_by: salesId, status: "pending",
      });
      summary.pending_approvals = 1;
    } catch (e) { lg(`approval skip: ${(e as Error).message}`); }

    // 7e. Customer follow-ups
    try {
      await sc.from("customer_followups").insert([
        { dealer_id: dealerId, customer_id: custByName["Lake View Apartments"], followup_date: daysAgo(-2), note: "Call for outstanding payment", status: "pending", created_by: adminId },
        { dealer_id: dealerId, customer_id: custByName["Karim Tiles House"], followup_date: daysAgo(2), note: "Confirmed payment by Friday", status: "completed", created_by: adminId },
      ]);
      summary.followups = 2;
    } catch (e) { lg(`followup skip: ${(e as Error).message}`); }

    // 7f. Campaign gift
    try {
      await sc.from("campaign_gifts").insert({
        dealer_id: dealerId, customer_id: custByName["Karim Tiles House"],
        campaign_name: "Eid Bonus 2026", description: "Premium tile sample kit",
        gift_value: 2500, payment_status: "pending", created_by: adminId,
      });
      summary.campaign_gifts = 1;
    } catch (e) { lg(`campaign skip: ${(e as Error).message}`); }

    // 7g. WhatsApp log (mock)
    try {
      await sc.from("whatsapp_message_logs").insert({
        dealer_id: dealerId, source_type: "sale",
        source_id: createdSales[0].id, message_type: "invoice_share",
        status: "sent", sent_at: new Date().toISOString(),
        recipient_phone: "01911000001", recipient_name: "Walk-in Customer",
      } as any).select().maybeSingle().then(() => {});
      summary.whatsapp_logs = 1;
    } catch (e) { lg(`whatsapp skip: ${(e as Error).message}`); }

    // 7h. Portal user (invited)
    try {
      await sc.from("portal_users").insert({
        dealer_id: dealerId, customer_id: custByName["Bashundhara Heights Project"],
        email: "portal.bashundhara@example.com", name: "Bashundhara Site Engineer",
        phone: "01911100011", portal_role: "project_customer", status: "invited",
        invited_by: adminId,
      });
      summary.portal_users = 1;
    } catch (e) { lg(`portal skip: ${(e as Error).message}`); }

    // 7i. Expense
    try {
      const { data: exp } = await sc.from("expenses").insert({
        dealer_id: dealerId, description: "Showroom electricity bill",
        amount: 8500, expense_date: daysAgo(5), category: "Utilities",
        created_by: adminId,
      }).select("id").single();
      if (exp) {
        await sc.from("expense_ledger").insert({
          dealer_id: dealerId, expense_id: exp.id, amount: 8500,
          category: "Utilities", description: "Electricity",
          entry_date: daysAgo(5),
        });
      }
      summary.expenses = 1;
    } catch (e) { lg(`expense skip: ${(e as Error).message}`); }

    // ============================================================
    // FINAL summary
    // ============================================================
    return new Response(JSON.stringify({
      success: true,
      dealer_id: dealerId,
      dealer_name: DEMO_DEALER_NAME,
      credentials: {
        dealer_admin: { email: DEMO_ADMIN_EMAIL, password: DEMO_PASSWORD, role: "dealer_admin" },
        salesman: { email: DEMO_SALES_EMAIL, password: DEMO_PASSWORD, role: "salesman" },
        cashier: { email: DEMO_CASHIER_EMAIL, password: DEMO_PASSWORD, role: "salesman (cashier)" },
      },
      summary,
      log,
    }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[seed] FATAL", err);
    return new Response(JSON.stringify({ error: (err as Error).message, stack: (err as Error).stack }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
