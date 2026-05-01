/**
 * Supplier Notes — VPS-backed.
 *
 * Owner/admin internal performance notes. Advisory only — never affects
 * reliability scoring. Audit trail is written server-side by the backend
 * (POST/PATCH/DELETE /api/suppliers/:id/notes[/:noteId]).
 */
import { vpsAuthedFetch } from "@/lib/vpsAuthClient";

export interface SupplierNote {
  id: string;
  dealer_id: string;
  supplier_id: string;
  note: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

async function vpsJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await vpsAuthedFetch(path, init);
  if (res.status === 204) return undefined as unknown as T;
  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    const msg = (body as any)?.error || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body as T;
}

export const supplierNotesService = {
  async list(dealerId: string, supplierId: string): Promise<SupplierNote[]> {
    const body = await vpsJson<{ rows: SupplierNote[] }>(
      `/api/suppliers/${supplierId}/notes?dealerId=${encodeURIComponent(dealerId)}`,
    );
    return body.rows ?? [];
  },

  async create(input: { dealerId: string; supplierId: string; note: string }): Promise<SupplierNote> {
    const trimmed = input.note.trim();
    if (!trimmed) throw new Error("Note cannot be empty");
    if (trimmed.length > 2000) throw new Error("Note must be under 2000 characters");

    const body = await vpsJson<{ row: SupplierNote }>(
      `/api/suppliers/${input.supplierId}/notes?dealerId=${encodeURIComponent(input.dealerId)}`,
      {
        method: "POST",
        body: JSON.stringify({ note: trimmed }),
      },
    );
    return body.row;
  },

  async update(id: string, input: { dealerId: string; note: string; supplierId?: string }): Promise<SupplierNote> {
    const trimmed = input.note.trim();
    if (!trimmed) throw new Error("Note cannot be empty");
    if (trimmed.length > 2000) throw new Error("Note must be under 2000 characters");
    if (!input.supplierId) {
      // Fallback: backend requires supplier scoping in the URL. Resolve by
      // fetching the row's supplier_id is impractical; the panel always
      // passes supplierId, so this branch should never run in practice.
      throw new Error("supplierId required for update");
    }
    const body = await vpsJson<{ row: SupplierNote }>(
      `/api/suppliers/${input.supplierId}/notes/${id}?dealerId=${encodeURIComponent(input.dealerId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ note: trimmed }),
      },
    );
    return body.row;
  },

  async delete(id: string, dealerId: string, supplierId?: string): Promise<void> {
    if (!supplierId) throw new Error("supplierId required for delete");
    await vpsJson<void>(
      `/api/suppliers/${supplierId}/notes/${id}?dealerId=${encodeURIComponent(dealerId)}`,
      { method: "DELETE" },
    );
  },
};
