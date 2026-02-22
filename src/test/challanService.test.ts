import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Supabase client ───────────────────────────────────
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();

function createChainMock() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
  };
  return chain;
}

let fromChains: Record<string, ReturnType<typeof createChainMock>> = {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (!fromChains[table]) fromChains[table] = createChainMock();
      return fromChains[table];
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    },
  },
}));

// ── Mock dependencies ──────────────────────────────────────
vi.mock("@/services/stockService", () => ({
  stockService: {
    reserveStock: vi.fn().mockResolvedValue(undefined),
    unreserveStock: vi.fn().mockResolvedValue(undefined),
    deductReservedStock: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/services/ledgerService", () => ({
  customerLedgerService: {
    addEntry: vi.fn().mockResolvedValue(undefined),
  },
  cashLedgerService: {
    addEntry: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/services/auditService", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

const mockAssertDealerId = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/tenancy", () => ({
  assertDealerId: (...args: any[]) => mockAssertDealerId(...args),
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimits: {
    api: vi.fn(),
  },
}));

import { challanService } from "@/services/challanService";
import { stockService } from "@/services/stockService";
import { customerLedgerService, cashLedgerService } from "@/services/ledgerService";

// ── Tests ──────────────────────────────────────────────────
describe("challanService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromChains = {};
  });

  describe("dealer scope validation", () => {
    it("create calls assertDealerId with the provided dealer_id", async () => {
      // Setup: sale query returns a valid challan_mode sale
      const saleChain = createChainMock();
      saleChain.single.mockResolvedValue({
        data: {
          id: "sale-1",
          sale_type: "challan_mode",
          sale_status: "draft",
          sale_items: [{ product_id: "p1", quantity: 5, products: { unit_type: "box_sft" } }],
        },
        error: null,
      });

      const challanChain = createChainMock();
      challanChain.single.mockResolvedValue({
        data: { id: "ch-1", challan_no: "CH-00001" },
        error: null,
      });

      // Count query for challan number generation
      const countChain = createChainMock();
      countChain.eq.mockReturnValue({
        ...countChain,
        select: vi.fn().mockResolvedValue({ count: 0, error: null }),
      });

      fromChains["sales"] = saleChain;
      fromChains["challans"] = challanChain;

      // Override from to handle count query
      const origFrom = (await import("@/integrations/supabase/client")).supabase.from;

      try {
        await challanService.create({
          dealer_id: "dealer-1",
          sale_id: "sale-1",
          challan_date: "2026-01-01",
        });
      } catch {
        // May fail due to mock chain, but assertDealerId should have been called
      }

      expect(mockAssertDealerId).toHaveBeenCalledWith("dealer-1");
    });

    it("create rejects mismatched dealer_id", async () => {
      mockAssertDealerId.mockRejectedValueOnce(
        new Error("Access denied: dealer_id mismatch. You cannot operate on another dealer's data.")
      );

      await expect(
        challanService.create({
          dealer_id: "wrong-dealer",
          sale_id: "sale-1",
          challan_date: "2026-01-01",
        })
      ).rejects.toThrow("Access denied: dealer_id mismatch");
    });

    it("markDelivered calls assertDealerId", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({
        data: { id: "ch-1", status: "pending", dealer_id: "dealer-1", sales: { id: "s1", sale_status: "challan_created" } },
        error: null,
      });
      fromChains["challans"] = chain;

      try {
        await challanService.markDelivered("ch-1", "dealer-1");
      } catch {
        // may fail on subsequent mock calls
      }

      expect(mockAssertDealerId).toHaveBeenCalledWith("dealer-1");
    });

    it("markDelivered rejects wrong dealer", async () => {
      mockAssertDealerId.mockRejectedValueOnce(new Error("Access denied: dealer_id mismatch."));

      await expect(
        challanService.markDelivered("ch-1", "wrong-dealer")
      ).rejects.toThrow("Access denied");
    });

    it("convertToInvoice calls assertDealerId", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({
        data: {
          id: "s1", sale_status: "delivered", customer_id: "c1",
          total_amount: 1000, paid_amount: 500, sale_date: "2026-01-01",
          invoice_number: "INV-00001",
          sale_items: [], customers: { name: "Test" },
        },
        error: null,
      });
      fromChains["sales"] = chain;

      try {
        await challanService.convertToInvoice("s1", "dealer-1");
      } catch {
        // may fail on mock
      }

      expect(mockAssertDealerId).toHaveBeenCalledWith("dealer-1");
    });

    it("cancelChallan calls assertDealerId", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({
        data: {
          id: "ch-1", status: "pending", dealer_id: "dealer-1",
          sales: { id: "s1", sale_items: [] },
        },
        error: null,
      });
      fromChains["challans"] = chain;

      try {
        await challanService.cancelChallan("ch-1", "dealer-1");
      } catch {
        // may fail on mock
      }

      expect(mockAssertDealerId).toHaveBeenCalledWith("dealer-1");
    });

    it("cancelChallan rejects wrong dealer", async () => {
      mockAssertDealerId.mockRejectedValueOnce(new Error("Access denied: dealer_id mismatch."));

      await expect(
        challanService.cancelChallan("ch-1", "wrong-dealer")
      ).rejects.toThrow("Access denied");
    });
  });

  describe("status validation", () => {
    it("create rejects non-challan_mode sale", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({
        data: { id: "s1", sale_type: "direct_invoice", sale_status: "invoiced", sale_items: [] },
        error: null,
      });
      fromChains["sales"] = chain;

      await expect(
        challanService.create({
          dealer_id: "dealer-1",
          sale_id: "s1",
          challan_date: "2026-01-01",
        })
      ).rejects.toThrow("Sale is not in challan mode");
    });

    it("create rejects sale with non-draft status", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({
        data: { id: "s1", sale_type: "challan_mode", sale_status: "challan_created", sale_items: [] },
        error: null,
      });
      fromChains["sales"] = chain;

      await expect(
        challanService.create({
          dealer_id: "dealer-1",
          sale_id: "s1",
          challan_date: "2026-01-01",
        })
      ).rejects.toThrow("Challan already created");
    });

    it("markDelivered rejects non-pending challan", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({
        data: { id: "ch-1", status: "delivered", dealer_id: "dealer-1" },
        error: null,
      });
      fromChains["challans"] = chain;

      await expect(
        challanService.markDelivered("ch-1", "dealer-1")
      ).rejects.toThrow("Challan is not pending");
    });

    it("convertToInvoice rejects non-delivered sale", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({
        data: { id: "s1", sale_status: "draft", sale_items: [], customers: {} },
        error: null,
      });
      fromChains["sales"] = chain;

      await expect(
        challanService.convertToInvoice("s1", "dealer-1")
      ).rejects.toThrow("Sale must be delivered or challan_created");
    });

    it("cancelChallan rejects already cancelled challan", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({
        data: { id: "ch-1", status: "cancelled", sales: { id: "s1", sale_items: [] } },
        error: null,
      });
      fromChains["challans"] = chain;

      await expect(
        challanService.cancelChallan("ch-1", "dealer-1")
      ).rejects.toThrow("Cannot cancel this challan");
    });
  });

  describe("challan not found", () => {
    it("markDelivered throws when challan not found", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({ data: null, error: { message: "not found" } });
      fromChains["challans"] = chain;

      await expect(
        challanService.markDelivered("nonexistent", "dealer-1")
      ).rejects.toThrow("Challan not found");
    });

    it("cancelChallan throws when challan not found", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({ data: null, error: { message: "not found" } });
      fromChains["challans"] = chain;

      await expect(
        challanService.cancelChallan("nonexistent", "dealer-1")
      ).rejects.toThrow("Challan not found");
    });

    it("convertToInvoice throws when sale not found", async () => {
      const chain = createChainMock();
      chain.single.mockResolvedValue({ data: null, error: { message: "not found" } });
      fromChains["sales"] = chain;

      await expect(
        challanService.convertToInvoice("nonexistent", "dealer-1")
      ).rejects.toThrow("Sale not found");
    });
  });
});
