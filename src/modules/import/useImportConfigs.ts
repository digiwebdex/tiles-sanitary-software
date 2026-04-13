import type { ColumnDef, ImportResult } from "./BulkImportDialog";
import { supabase } from "@/integrations/supabase/client";

// ─── Products ─────────────────────────────────────────────
export const productColumns: ColumnDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "sku", label: "SKU", required: true },
  { key: "category", label: "Category", required: true, validate: (v) => ["tiles", "sanitary"].includes(v.toLowerCase()) ? null : "Must be 'tiles' or 'sanitary'" },
  { key: "unit_type", label: "Unit Type", required: true, validate: (v) => ["box_sft", "piece"].includes(v.toLowerCase()) ? null : "Must be 'box_sft' or 'piece'" },
  { key: "per_box_sft", label: "Per Box SFT", validate: (v) => v && isNaN(Number(v)) ? "Must be a number" : null },
  { key: "default_sale_rate", label: "Sale Rate", required: true, validate: (v) => isNaN(Number(v)) || Number(v) < 0 ? "Must be a positive number" : null },
  { key: "cost_price", label: "Cost Price", validate: (v) => v && isNaN(Number(v)) ? "Must be a number" : null },
  { key: "brand", label: "Brand" },
  { key: "size", label: "Size" },
  { key: "color", label: "Color" },
  { key: "barcode", label: "Barcode" },
  { key: "reorder_level", label: "Reorder Level", validate: (v) => v && isNaN(Number(v)) ? "Must be a number" : null },
];

export const productSampleData = [
  { name: "Floor Tile 60x60", sku: "FT-001", category: "tiles", unit_type: "box_sft", per_box_sft: "16", default_sale_rate: "45", cost_price: "35", brand: "RAK", size: "60x60", color: "White", barcode: "123456", reorder_level: "10" },
  { name: "Commode Standard", sku: "SN-001", category: "sanitary", unit_type: "piece", per_box_sft: "", default_sale_rate: "5500", cost_price: "4000", brand: "COTTO", size: "", color: "White", barcode: "", reorder_level: "5" },
];

export async function importProducts(rows: Record<string, string>[], mode: "skip" | "overwrite", dealerId: string): Promise<ImportResult> {
  const result: ImportResult = { success: 0, skipped: 0, errors: [] };

  // Get existing SKUs and barcodes for duplicate detection
  const { data: existing } = await supabase.from("products").select("sku, barcode").eq("dealer_id", dealerId);
  const existingSkus = new Set((existing ?? []).map((p) => p.sku.toLowerCase()));
  const existingBarcodes = new Set((existing ?? []).filter((p) => p.barcode).map((p) => p.barcode!.toLowerCase()));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sku = row.sku?.trim();
    if (!sku) { result.errors.push({ row: i + 2, field: "SKU", message: "Missing" }); continue; }

    const isDuplicate = existingSkus.has(sku.toLowerCase());
    const barcodeConflict = row.barcode?.trim() && existingBarcodes.has(row.barcode.trim().toLowerCase());

    if (isDuplicate && mode === "skip") { result.skipped++; continue; }
    if (barcodeConflict && mode === "skip") { result.skipped++; continue; }

    const category = row.category?.toLowerCase().trim();
    if (category === "tiles" && !row.per_box_sft?.trim()) {
      result.errors.push({ row: i + 2, field: "Per Box SFT", message: "Required for tiles" });
      continue;
    }

    const payload = {
      dealer_id: dealerId,
      name: row.name?.trim(),
      sku: sku,
      category: category as "tiles" | "sanitary",
      unit_type: (row.unit_type?.toLowerCase().trim() || "piece") as "box_sft" | "piece",
      per_box_sft: row.per_box_sft ? Number(row.per_box_sft) : null,
      default_sale_rate: Number(row.default_sale_rate) || 0,
      cost_price: Number(row.cost_price) || 0,
      brand: row.brand?.trim() || null,
      size: row.size?.trim() || null,
      color: row.color?.trim() || null,
      barcode: row.barcode?.trim() || null,
      reorder_level: Number(row.reorder_level) || 0,
    };

    if (isDuplicate && mode === "overwrite") {
      const { error } = await supabase.from("products").update(payload).eq("dealer_id", dealerId).eq("sku", sku);
      if (error) { result.errors.push({ row: i + 2, field: "SKU", message: error.message }); continue; }
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) { result.errors.push({ row: i + 2, field: "SKU", message: error.message }); continue; }
    }
    result.success++;
  }
  return result;
}

// ─── Customers ────────────────────────────────────────────
export const customerColumns: ColumnDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "type", label: "Type", validate: (v) => v && !["retailer", "customer", "project"].includes(v.toLowerCase()) ? "Must be retailer, customer, or project" : null },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "credit_limit", label: "Credit Limit", validate: (v) => v && isNaN(Number(v)) ? "Must be a number" : null },
  { key: "max_overdue_days", label: "Max Overdue Days", validate: (v) => v && isNaN(Number(v)) ? "Must be a number" : null },
  { key: "opening_balance", label: "Opening Balance", validate: (v) => v && isNaN(Number(v)) ? "Must be a number" : null },
  { key: "reference_name", label: "Reference" },
];

export const customerSampleData = [
  { name: "Ahmed Interior", type: "retailer", phone: "01700000001", email: "ahmed@example.com", address: "Dhaka", credit_limit: "50000", max_overdue_days: "30", opening_balance: "0", reference_name: "" },
  { name: "Rahim Construction", type: "project", phone: "01800000002", email: "", address: "Chittagong", credit_limit: "100000", max_overdue_days: "60", opening_balance: "5000", reference_name: "Karim" },
];

export async function importCustomers(rows: Record<string, string>[], mode: "skip" | "overwrite", dealerId: string): Promise<ImportResult> {
  const result: ImportResult = { success: 0, skipped: 0, errors: [] };
  const { data: existing } = await supabase.from("customers").select("name").eq("dealer_id", dealerId);
  const existingNames = new Set((existing ?? []).map((c) => c.name.toLowerCase()));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.name?.trim();
    if (!name) { result.errors.push({ row: i + 2, field: "Name", message: "Missing" }); continue; }

    if (existingNames.has(name.toLowerCase()) && mode === "skip") { result.skipped++; continue; }

    const payload = {
      dealer_id: dealerId,
      name,
      type: (row.type?.toLowerCase().trim() || "customer") as "retailer" | "customer" | "project",
      phone: row.phone?.trim() || null,
      email: row.email?.trim() || null,
      address: row.address?.trim() || null,
      credit_limit: Number(row.credit_limit) || 0,
      max_overdue_days: Number(row.max_overdue_days) || 0,
      opening_balance: Number(row.opening_balance) || 0,
      reference_name: row.reference_name?.trim() || null,
    };

    if (existingNames.has(name.toLowerCase()) && mode === "overwrite") {
      const { error } = await supabase.from("customers").update(payload).eq("dealer_id", dealerId).ilike("name", name);
      if (error) { result.errors.push({ row: i + 2, field: "Name", message: error.message }); continue; }
    } else {
      const { error } = await supabase.from("customers").insert(payload);
      if (error) { result.errors.push({ row: i + 2, field: "Name", message: error.message }); continue; }
    }
    result.success++;
  }
  return result;
}

// ─── Suppliers ────────────────────────────────────────────
export const supplierColumns: ColumnDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "contact_person", label: "Contact Person" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "gstin", label: "GSTIN" },
  { key: "opening_balance", label: "Opening Balance", validate: (v) => v && isNaN(Number(v)) ? "Must be a number" : null },
];

export const supplierSampleData = [
  { name: "RAK Ceramics", contact_person: "Mr. Hasan", phone: "01900000001", email: "rak@example.com", address: "Dhaka", gstin: "", opening_balance: "0" },
  { name: "COTTO Bangladesh", contact_person: "Mr. Karim", phone: "01900000002", email: "", address: "Chittagong", gstin: "12345", opening_balance: "10000" },
];

export async function importSuppliers(rows: Record<string, string>[], mode: "skip" | "overwrite", dealerId: string): Promise<ImportResult> {
  const result: ImportResult = { success: 0, skipped: 0, errors: [] };
  const { data: existing } = await supabase.from("suppliers").select("name").eq("dealer_id", dealerId);
  const existingNames = new Set((existing ?? []).map((s) => s.name.toLowerCase()));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.name?.trim();
    if (!name) { result.errors.push({ row: i + 2, field: "Name", message: "Missing" }); continue; }

    if (existingNames.has(name.toLowerCase()) && mode === "skip") { result.skipped++; continue; }

    const payload = {
      dealer_id: dealerId,
      name,
      contact_person: row.contact_person?.trim() || null,
      phone: row.phone?.trim() || null,
      email: row.email?.trim() || null,
      address: row.address?.trim() || null,
      gstin: row.gstin?.trim() || null,
      opening_balance: Number(row.opening_balance) || 0,
    };

    if (existingNames.has(name.toLowerCase()) && mode === "overwrite") {
      const { error } = await supabase.from("suppliers").update(payload).eq("dealer_id", dealerId).ilike("name", name);
      if (error) { result.errors.push({ row: i + 2, field: "Name", message: error.message }); continue; }
    } else {
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) { result.errors.push({ row: i + 2, field: "Name", message: error.message }); continue; }
    }
    result.success++;
  }
  return result;
}
