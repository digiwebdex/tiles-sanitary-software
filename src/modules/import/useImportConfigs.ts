import type { ColumnDef, ImportResult } from "./BulkImportDialog";
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

async function postImport(
  endpoint: "products" | "customers" | "suppliers",
  rows: Record<string, string>[],
  mode: "skip" | "overwrite",
  dealerId: string,
): Promise<ImportResult> {
  const res = await vpsAuthedFetch(`/api/imports/${endpoint}`, {
    method: "POST",
    body: JSON.stringify({ dealerId, mode, rows }),
  });
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error((body as any)?.error || `Bulk import failed (${res.status})`);
  }
  return {
    success: Number((body as any).success ?? 0),
    skipped: Number((body as any).skipped ?? 0),
    errors: Array.isArray((body as any).errors) ? (body as any).errors : [],
  };
}

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
  return postImport("products", rows, mode, dealerId);
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
  return postImport("customers", rows, mode, dealerId);
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
  return postImport("suppliers", rows, mode, dealerId);
}
