/**
 * Phase 2 dataClient adapter contract tests.
 *
 * Verifies:
 *   - default flag (no env) → supabaseAdapter
 *   - VITE_DATA_CUSTOMERS=vps → vpsAdapter
 *   - VITE_DATA_CUSTOMERS=shadow → shadowAdapter (primary read returned,
 *     parallel vps read fired and swallowed on failure)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoisted mocks so the env module sees them before evaluation.
const supabaseMock = {
  from: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock,
}));

vi.mock("@/lib/vpsAuthClient", () => ({
  vpsAuthedFetch: vi.fn(async () =>
    new Response(JSON.stringify({ rows: [], total: 0 }), { status: 200 }),
  ),
}));

function buildPostgrestStub(rows: unknown[], total: number) {
  const stub: any = {};
  const chain = (out: any) => {
    Object.assign(stub, {
      select: vi.fn(() => stub),
      eq: vi.fn(() => stub),
      is: vi.fn(() => stub),
      order: vi.fn(() => stub),
      range: vi.fn(() => Promise.resolve(out)),
      maybeSingle: vi.fn(() => Promise.resolve(out)),
      single: vi.fn(() => Promise.resolve(out)),
      insert: vi.fn(() => stub),
      update: vi.fn(() => stub),
      delete: vi.fn(() => Promise.resolve({ error: null })),
    });
  };
  chain({ data: rows, error: null, count: total });
  return stub;
}

beforeEach(() => {
  vi.resetModules();
  supabaseMock.from.mockReset();
});

describe("dataClient flag routing", () => {
  it("defaults to supabaseAdapter when no env flag is set", async () => {
    const { dataClient } = await import("@/lib/data/dataClient");

    const stub = buildPostgrestStub([{ id: "c1" }], 1);
    supabaseMock.from.mockReturnValue(stub);

    const customers = dataClient<{ id: string }>("CUSTOMERS");
    const result = await customers.list({ dealerId: "d1", page: 0, pageSize: 25 });

    expect(supabaseMock.from).toHaveBeenCalledWith("customers");
    expect(result.rows).toEqual([{ id: "c1" }]);
    expect(result.total).toBe(1);
  });

  it("uses vpsAdapter when flag = vps", async () => {
    vi.stubEnv("VITE_DATA_CUSTOMERS", "vps");
    const { vpsAuthedFetch } = await import("@/lib/vpsAuthClient");
    const { dataClient } = await import("@/lib/data/dataClient");

    const customers = dataClient<{ id: string }>("CUSTOMERS");
    await customers.list({ dealerId: "d1" });

    expect(vpsAuthedFetch).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("returns supabase rows even when shadow vps read fails", async () => {
    vi.stubEnv("VITE_DATA_CUSTOMERS", "shadow");
    const { vpsAuthedFetch } = await import("@/lib/vpsAuthClient");
    (vpsAuthedFetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "ROUTE_NOT_IMPLEMENTED" }), { status: 404 }),
    );

    const stub = buildPostgrestStub([{ id: "c2" }], 1);
    supabaseMock.from.mockReturnValue(stub);

    const { dataClient } = await import("@/lib/data/dataClient");
    const customers = dataClient<{ id: string }>("CUSTOMERS");
    const result = await customers.list({ dealerId: "d1" });

    expect(result.rows).toEqual([{ id: "c2" }]);
    // Allow the fire-and-forget shadow read to settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(vpsAuthedFetch).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
