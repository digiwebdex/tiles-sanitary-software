/**
 * Phase 3C — customerService rewire integration test.
 *
 * Mirrors suppliersServiceRewire.test.ts. Verifies:
 *   1. customerService.list() (no search) routes through dataClient (so
 *      shadow mode actually fires when configured).
 *   2. customerService.list() (with search) bypasses the adapter and uses
 *      the legacy Supabase OR-ilike path — preserving exact behavior.
 *   3. customerService.list() preserves the legacy `{ data, total }`
 *      response shape so no UI consumer breaks.
 *   4. typeFilter is forwarded as an equality filter to the adapter.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { adapterListMock, adapterGetByIdMock } = vi.hoisted(() => ({
  adapterListMock: vi.fn(),
  adapterGetByIdMock: vi.fn(),
}));

vi.mock("@/lib/data/dataClient", () => ({
  dataClient: () => ({
    list: adapterListMock,
    getById: adapterGetByIdMock,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}));

const {
  supabaseRangeMock,
  supabaseEqOrderMock,
  supabaseOrMock,
  supabaseEqMock,
  supabaseFromMock,
  supabaseGetUserMock,
} = vi.hoisted(() => {
  const supabaseRangeMock = vi.fn();
  // After .or().order() we either call .range() directly OR call .eq(type).range()
  const supabaseEqOrderMock = vi.fn(() => ({ range: supabaseRangeMock }));
  const supabaseOrderMock = vi.fn(() => ({
    range: supabaseRangeMock,
    eq: supabaseEqOrderMock,
  }));
  const supabaseOrMock = vi.fn(() => ({ order: supabaseOrderMock }));
  const supabaseEqMock = vi.fn(() => ({ or: supabaseOrMock }));
  const supabaseSelectMock = vi.fn(() => ({ eq: supabaseEqMock }));
  const supabaseFromMock = vi.fn(() => ({ select: supabaseSelectMock }));
  const supabaseGetUserMock = vi.fn(async () => ({ data: { user: null } }));
  return {
    supabaseRangeMock,
    supabaseEqOrderMock,
    supabaseOrMock,
    supabaseEqMock,
    supabaseFromMock,
    supabaseGetUserMock,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: supabaseFromMock,
    auth: { getUser: supabaseGetUserMock },
  },
}));

import { customerService } from "@/services/customerService";

beforeEach(() => {
  adapterListMock.mockReset();
  adapterGetByIdMock.mockReset();
  supabaseRangeMock.mockReset();
  supabaseOrMock.mockClear();
  supabaseEqMock.mockClear();
  supabaseEqOrderMock.mockClear();
  supabaseFromMock.mockClear();
});

describe("Phase 3C — customerService routes reads through dataClient", () => {
  it("empty-search list → uses dataClient adapter (shadow-eligible path)", async () => {
    adapterListMock.mockResolvedValueOnce({
      rows: [{ id: "c1", name: "Acme" }],
      total: 1,
    });

    const result = await customerService.list("dealer-1", "", "", 1);

    expect(adapterListMock).toHaveBeenCalledTimes(1);
    expect(adapterListMock).toHaveBeenCalledWith({
      dealerId: "dealer-1",
      page: 0, // 1-indexed UI → 0-indexed adapter
      pageSize: 25,
      orderBy: { column: "name", direction: "asc" },
      filters: undefined,
    });

    // Legacy response shape preserved
    expect(result).toEqual({ data: [{ id: "c1", name: "Acme" }], total: 1 });

    // Supabase direct path was NOT used
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it("typeFilter → forwarded as adapter equality filter", async () => {
    adapterListMock.mockResolvedValueOnce({ rows: [], total: 0 });

    await customerService.list("dealer-1", "", "retailer", 1);

    expect(adapterListMock).toHaveBeenCalledWith({
      dealerId: "dealer-1",
      page: 0,
      pageSize: 25,
      orderBy: { column: "name", direction: "asc" },
      filters: { type: "retailer" },
    });
  });

  it("search list → bypasses adapter, uses legacy Supabase OR-ilike path", async () => {
    supabaseRangeMock.mockResolvedValueOnce({
      data: [{ id: "c2", name: "Beta" }],
      error: null,
      count: 1,
    });

    const result = await customerService.list("dealer-1", "bet", "", 2);

    expect(adapterListMock).not.toHaveBeenCalled();
    expect(supabaseFromMock).toHaveBeenCalledWith("customers");
    expect(supabaseEqMock).toHaveBeenCalledWith("dealer_id", "dealer-1");
    expect(supabaseOrMock).toHaveBeenCalledWith(
      "name.ilike.%bet%,phone.ilike.%bet%,reference_name.ilike.%bet%",
    );
    // page 2 → from=25, to=49
    expect(supabaseRangeMock).toHaveBeenCalledWith(25, 49);
    expect(result).toEqual({ data: [{ id: "c2", name: "Beta" }], total: 1 });
  });

  it("propagates adapter errors from list (no silent swallow on primary)", async () => {
    adapterListMock.mockRejectedValueOnce(new Error("network down"));
    await expect(customerService.list("dealer-1", "", "", 1)).rejects.toThrow(
      "network down",
    );
  });
});
