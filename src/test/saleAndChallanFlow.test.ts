import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mock chain builder ──────────────────────────────
function createChainMock(defaultData: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: defaultData, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: defaultData, error: null }),
  };
  return chain;
}

let fromChains: Record<string, any> = {};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (!fromChains[table]) fromChains[table] = createChainMock();
      return fromChains[table];
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    rpc: vi.fn().mockImplementation((fnName: string) => {
      if (fnName === "generate_next_challan_no") {
        return Promise.resolve({ data: "CH-00001", error: null });
      }
      if (fnName === "generate_next_invoice_no") {
        return Promise.resolve({ data: "INV-00006", error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  },
}));

// ── Mock all service dependencies ──────────────────────────
const mockDeductStock = vi.fn().mockResolvedValue(undefined);
const mockRestoreStock = vi.fn().mockResolvedValue(undefined);
const mockReserveStock = vi.fn().mockResolvedValue(undefined);
const mockUnreserveStock = vi.fn().mockResolvedValue(undefined);
const mockDeductReservedStock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/services/stockService", () => ({
  stockService: {
    deductStock: (...args: any[]) => mockDeductStock(...args),
    restoreStock: (...args: any[]) => mockRestoreStock(...args),
    reserveStock: (...args: any[]) => mockReserveStock(...args),
    unreserveStock: (...args: any[]) => mockUnreserveStock(...args),
    deductReservedStock: (...args: any[]) => mockDeductReservedStock(...args),
    updateAverageCost: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock batchService — new code path for stock deduction
const mockBatchDeductUnbatched = vi.fn().mockResolvedValue(undefined);
const mockBatchPlanFIFO = vi.fn().mockResolvedValue({ allocations: [] });
const mockBatchExecuteAlloc = vi.fn().mockResolvedValue(undefined);

vi.mock("@/services/batchService", () => ({
  batchService: {
    deductStockUnbatched: (...args: any[]) => mockBatchDeductUnbatched(...args),
    planFIFOAllocation: (...args: any[]) => mockBatchPlanFIFO(...args),
    executeSaleAllocation: (...args: any[]) => mockBatchExecuteAlloc(...args),
    restoreSaleBatches: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockCustomerLedgerAdd = vi.fn().mockResolvedValue(undefined);
const mockCashLedgerAdd = vi.fn().mockResolvedValue(undefined);

vi.mock("@/services/ledgerService", () => ({
  customerLedgerService: { addEntry: (...args: any[]) => mockCustomerLedgerAdd(...args) },
  cashLedgerService: { addEntry: (...args: any[]) => mockCashLedgerAdd(...args) },
}));

vi.mock("@/services/auditService", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tenancy", () => ({
  assertDealerId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimits: { api: vi.fn() },
}));

vi.mock("@/lib/validators", () => ({
  validateInput: vi.fn(),
  createSaleServiceSchema: {},
  stockAdjustmentServiceSchema: {},
}));

vi.mock("@/services/notificationService", () => ({
  notificationService: {
    notifySaleCreated: vi.fn(),
  },
}));

import { salesService } from "@/services/salesService";
import { challanService } from "@/services/challanService";

const DEALER_ID = "dealer-001";
const SALE_ID = "sale-001";
const CHALLAN_ID = "challan-001";
const CUSTOMER_ID = "cust-001";
const PRODUCT_ID = "prod-001";

const baseSaleInput = {
  dealer_id: DEALER_ID,
  customer_name: "Test Customer",
  sale_date: "2026-02-22",
  discount: 0,
  discount_reference: "",
  client_reference: "",
  fitter_reference: "",
  paid_amount: 500,
  payment_mode: "cash",
  notes: "",
  created_by: "user-1",
  items: [{ product_id: PRODUCT_ID, quantity: 10, sale_rate: 50 }],
};

// ── Helper to set up common Supabase mocks ─────────────────
function setupSaleMocks() {
  // Customer lookup
  const customerChain = createChainMock({ id: CUSTOMER_ID });
  fromChains["customers"] = customerChain;

  // Products
  const productsChain = createChainMock();
  productsChain.in = vi.fn().mockResolvedValue({
    data: [{ id: PRODUCT_ID, unit_type: "box_sft", per_box_sft: 3.5 }],
    error: null,
  });
  fromChains["products"] = productsChain;

  // Stock — must include box_qty/piece_qty so shortage check passes
  const stockChain = createChainMock();
  stockChain.in = vi.fn().mockResolvedValue({
    data: [{
      product_id: PRODUCT_ID,
      average_cost_per_unit: 30,
      box_qty: 1000,
      piece_qty: 1000,
      reserved_box_qty: 0,
      reserved_piece_qty: 0,
    }],
    error: null,
  });
  fromChains["stock"] = stockChain;

  // Sales insert + count
  const salesChain = createChainMock();
  salesChain.select = vi.fn().mockImplementation((...args: any[]) => {
    // Count query for invoice number generation
    if (args[1]?.count === "exact") {
      return {
        eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
      };
    }
    return salesChain;
  });
  salesChain.single = vi.fn().mockResolvedValue({
    data: { id: SALE_ID, invoice_number: "INV-00006" },
    error: null,
  });
  fromChains["sales"] = salesChain;

  // Sale items — insert().select() must return inserted rows with ids
  const itemsChain = createChainMock();
  itemsChain.insert = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({
      data: [{ id: "sale-item-1", product_id: PRODUCT_ID }],
      error: null,
    }),
  });
  fromChains["sale_items"] = itemsChain;
}

// ════════════════════════════════════════════════════════════
// TEST SUITES
// ════════════════════════════════════════════════════════════

describe("Full Sale + Challan Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromChains = {};
  });

  // ── SALE CREATION ────────────────────────────────────────

  describe("Direct Invoice Sale Creation", () => {
    it("creates a direct invoice sale, deducts stock, and creates ledger entries", async () => {
      setupSaleMocks();

      const result = await salesService.create({
        ...baseSaleInput,
        sale_type: "direct_invoice",
      });

      expect(result).toBeDefined();
      expect(result!.id).toBe(SALE_ID);

      // Stock deducted for direct invoice (via batchService unbatched fallback)
      expect(mockBatchDeductUnbatched).toHaveBeenCalledWith(
        PRODUCT_ID, DEALER_ID, 10, "box_sft", 3.5
      );

      // Customer ledger: sale entry
      expect(mockCustomerLedgerAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          dealer_id: DEALER_ID,
          customer_id: CUSTOMER_ID,
          type: "sale",
        })
      );

      // Customer ledger: payment entry
      expect(mockCustomerLedgerAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "payment",
          amount: -500,
        })
      );

      // Cash ledger: receipt
      expect(mockCashLedgerAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "receipt",
          amount: 500,
        })
      );
    });

    it("does NOT create ledger entries when paid_amount is 0", async () => {
      setupSaleMocks();

      await salesService.create({
        ...baseSaleInput,
        sale_type: "direct_invoice",
        paid_amount: 0,
      });

      // Sale ledger entry should exist
      expect(mockCustomerLedgerAdd).toHaveBeenCalledTimes(1);
      expect(mockCustomerLedgerAdd).toHaveBeenCalledWith(
        expect.objectContaining({ type: "sale" })
      );

      // No payment/receipt entries
      expect(mockCashLedgerAdd).not.toHaveBeenCalled();
    });

    it("calculates box_sft totals correctly (SFT = qty × per_box_sft, amount = SFT × rate)", async () => {
      setupSaleMocks();

      // Override sales chain to capture the insert payload
      const salesChain = fromChains["sales"];
      let insertedPayload: any = null;
      salesChain.insert = vi.fn().mockImplementation((data: any) => {
        insertedPayload = data;
        return salesChain;
      });

      await salesService.create({
        ...baseSaleInput,
        sale_type: "direct_invoice",
      });

      // 10 boxes × 3.5 sft/box = 35 SFT
      // 35 SFT × 50 rate = 1750 total
      expect(insertedPayload).toBeDefined();
      expect(insertedPayload.total_box).toBe(10);
      expect(insertedPayload.total_sft).toBe(35);
      expect(insertedPayload.total_amount).toBe(1750);
      expect(insertedPayload.due_amount).toBe(1250); // 1750 - 500
    });
  });

  // ── CHALLAN MODE SALE ────────────────────────────────────

  describe("Challan Mode Sale Creation", () => {
    it("creates a sale in draft status without stock deduction or ledger entries", async () => {
      setupSaleMocks();

      // Override to verify sale_status = 'draft'
      let insertedPayload: any = null;
      const salesChain = fromChains["sales"];
      salesChain.insert = vi.fn().mockImplementation((data: any) => {
        insertedPayload = data;
        return salesChain;
      });

      const result = await salesService.create({
        ...baseSaleInput,
        sale_type: "challan_mode",
      });

      expect(result!.id).toBe(SALE_ID);
      expect(insertedPayload.sale_type).toBe("challan_mode");
      expect(insertedPayload.sale_status).toBe("draft");

      // NO stock deduction in challan mode
      expect(mockDeductStock).not.toHaveBeenCalled();

      // NO ledger entries in challan mode
      expect(mockCustomerLedgerAdd).not.toHaveBeenCalled();
      expect(mockCashLedgerAdd).not.toHaveBeenCalled();
    });
  });

  // ── CHALLAN CREATION ─────────────────────────────────────

  describe("Challan Creation", () => {
    it("creates a challan, reserves stock, and updates sale status", async () => {
      // Sale query
      const salesChain = createChainMock();
      salesChain.single = vi.fn().mockResolvedValue({
        data: {
          id: SALE_ID,
          sale_type: "challan_mode",
          sale_status: "draft",
          sale_items: [{ product_id: PRODUCT_ID, quantity: 10, products: { unit_type: "box_sft" } }],
        },
        error: null,
      });
      salesChain.update = vi.fn().mockReturnThis();
      salesChain.eq = vi.fn().mockReturnThis();
      fromChains["sales"] = salesChain;

      // Challan chain — handle both count and insert
      const challanChain = createChainMock();
      challanChain.select = vi.fn().mockImplementation((...args: any[]) => {
        if (args[1]?.count === "exact") {
          return {
            eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          };
        }
        return challanChain;
      });
      challanChain.single = vi.fn().mockResolvedValue({
        data: { id: CHALLAN_ID, challan_no: "CH-00001" },
        error: null,
      });
      fromChains["challans"] = challanChain;

      const result = await challanService.create({
        dealer_id: DEALER_ID,
        sale_id: SALE_ID,
        challan_date: "2026-02-22",
        driver_name: "John",
        transport_name: "Fast Transport",
        vehicle_no: "AB-1234",
      });

      expect(result).toBeDefined();
      expect(result!.id).toBe(CHALLAN_ID);

      // Stock reserved
      expect(mockReserveStock).toHaveBeenCalledWith(PRODUCT_ID, 10, DEALER_ID);
    });

    it("rejects challan for non-challan_mode sale", async () => {
      const salesChain = createChainMock();
      salesChain.single = vi.fn().mockResolvedValue({
        data: { id: SALE_ID, sale_type: "direct_invoice", sale_status: "invoiced", sale_items: [] },
        error: null,
      });
      fromChains["sales"] = salesChain;

      await expect(
        challanService.create({ dealer_id: DEALER_ID, sale_id: SALE_ID, challan_date: "2026-02-22" })
      ).rejects.toThrow("Sale is not in challan mode");
    });

    it("rejects challan for already-created challan (non-draft status)", async () => {
      const salesChain = createChainMock();
      salesChain.single = vi.fn().mockResolvedValue({
        data: { id: SALE_ID, sale_type: "challan_mode", sale_status: "challan_created", sale_items: [] },
        error: null,
      });
      fromChains["sales"] = salesChain;

      await expect(
        challanService.create({ dealer_id: DEALER_ID, sale_id: SALE_ID, challan_date: "2026-02-22" })
      ).rejects.toThrow("Challan already created");
    });
  });

  // ── MARK DELIVERED ───────────────────────────────────────

  describe("Mark Challan Delivered", () => {
    it("marks a pending challan as delivered", async () => {
      const challanChain = createChainMock();
      challanChain.single = vi.fn().mockResolvedValue({
        data: {
          id: CHALLAN_ID,
          status: "pending",
          dealer_id: DEALER_ID,
          sale_id: SALE_ID,
          sales: { id: SALE_ID, sale_status: "challan_created" },
        },
        error: null,
      });
      challanChain.update = vi.fn().mockReturnThis();
      challanChain.eq = vi.fn().mockReturnThis();
      fromChains["challans"] = challanChain;

      const salesChain = createChainMock();
      salesChain.update = vi.fn().mockReturnThis();
      salesChain.eq = vi.fn().mockReturnThis();
      fromChains["sales"] = salesChain;

      await expect(
        challanService.markDelivered(CHALLAN_ID, DEALER_ID)
      ).resolves.toBeUndefined();
    });

    it("rejects marking a non-pending challan as delivered", async () => {
      const challanChain = createChainMock();
      challanChain.single = vi.fn().mockResolvedValue({
        data: { id: CHALLAN_ID, status: "delivered", dealer_id: DEALER_ID },
        error: null,
      });
      fromChains["challans"] = challanChain;

      await expect(
        challanService.markDelivered(CHALLAN_ID, DEALER_ID)
      ).rejects.toThrow("Challan is not pending");
    });
  });

  // ── CONVERT TO INVOICE ───────────────────────────────────

  describe("Convert Challan to Invoice", () => {
    it("deducts reserved stock, creates ledger entries, and sets status to invoiced", async () => {
      const salesChain = createChainMock();
      salesChain.single = vi.fn().mockResolvedValue({
        data: {
          id: SALE_ID,
          sale_status: "delivered",
          customer_id: CUSTOMER_ID,
          total_amount: 1750,
          paid_amount: 500,
          sale_date: "2026-02-22",
          invoice_number: "INV-00006",
          sale_items: [
            { product_id: PRODUCT_ID, quantity: 10, total: 1750, products: { unit_type: "box_sft", per_box_sft: 3.5 } },
          ],
          customers: { name: "Test Customer" },
        },
        error: null,
      });
      salesChain.update = vi.fn().mockReturnThis();
      salesChain.eq = vi.fn().mockReturnThis();
      fromChains["sales"] = salesChain;

      await challanService.convertToInvoice(SALE_ID, DEALER_ID);

      // Reserved stock permanently deducted
      expect(mockDeductReservedStock).toHaveBeenCalledWith(PRODUCT_ID, 10, DEALER_ID);

      // Customer ledger: sale
      expect(mockCustomerLedgerAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "sale",
          amount: 1750,
          customer_id: CUSTOMER_ID,
        })
      );

      // Customer ledger: payment
      expect(mockCustomerLedgerAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "payment",
          amount: -500,
        })
      );

      // Cash ledger: receipt
      expect(mockCashLedgerAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "receipt",
          amount: 500,
        })
      );
    });

    it("rejects conversion for non-delivered sale", async () => {
      const salesChain = createChainMock();
      salesChain.single = vi.fn().mockResolvedValue({
        data: { id: SALE_ID, sale_status: "draft", sale_items: [], customers: {} },
        error: null,
      });
      fromChains["sales"] = salesChain;

      await expect(
        challanService.convertToInvoice(SALE_ID, DEALER_ID)
      ).rejects.toThrow("Sale must be delivered or challan_created");
    });

    it("accepts conversion for challan_created status", async () => {
      const salesChain = createChainMock();
      salesChain.single = vi.fn().mockResolvedValue({
        data: {
          id: SALE_ID,
          sale_status: "challan_created",
          customer_id: CUSTOMER_ID,
          total_amount: 1000,
          paid_amount: 0,
          sale_date: "2026-02-22",
          invoice_number: "INV-00007",
          sale_items: [],
          customers: { name: "Test" },
        },
        error: null,
      });
      salesChain.update = vi.fn().mockReturnThis();
      salesChain.eq = vi.fn().mockReturnThis();
      fromChains["sales"] = salesChain;

      await expect(
        challanService.convertToInvoice(SALE_ID, DEALER_ID)
      ).resolves.toBeUndefined();
    });
  });

  // ── CANCEL CHALLAN ───────────────────────────────────────

  describe("Cancel Challan", () => {
    it("cancels a pending challan, unreserves stock, and resets sale to draft", async () => {
      const challanChain = createChainMock();
      challanChain.single = vi.fn().mockResolvedValue({
        data: {
          id: CHALLAN_ID,
          status: "pending",
          dealer_id: DEALER_ID,
          sales: {
            id: SALE_ID,
            sale_items: [
              { product_id: PRODUCT_ID, quantity: 10, products: { unit_type: "box_sft" } },
            ],
          },
        },
        error: null,
      });
      challanChain.update = vi.fn().mockReturnThis();
      challanChain.eq = vi.fn().mockReturnThis();
      fromChains["challans"] = challanChain;

      const salesChain = createChainMock();
      salesChain.update = vi.fn().mockReturnThis();
      salesChain.eq = vi.fn().mockReturnThis();
      fromChains["sales"] = salesChain;

      await challanService.cancelChallan(CHALLAN_ID, DEALER_ID);

      // Stock unreserved
      expect(mockUnreserveStock).toHaveBeenCalledWith(PRODUCT_ID, 10, DEALER_ID);
    });

    it("cancels a delivered challan too", async () => {
      const challanChain = createChainMock();
      challanChain.single = vi.fn().mockResolvedValue({
        data: {
          id: CHALLAN_ID,
          status: "delivered",
          dealer_id: DEALER_ID,
          sales: { id: SALE_ID, sale_items: [] },
        },
        error: null,
      });
      challanChain.update = vi.fn().mockReturnThis();
      challanChain.eq = vi.fn().mockReturnThis();
      fromChains["challans"] = challanChain;

      const salesChain = createChainMock();
      salesChain.update = vi.fn().mockReturnThis();
      salesChain.eq = vi.fn().mockReturnThis();
      fromChains["sales"] = salesChain;

      await expect(
        challanService.cancelChallan(CHALLAN_ID, DEALER_ID)
      ).resolves.toBeUndefined();
    });

    it("rejects cancelling an already-cancelled challan", async () => {
      const challanChain = createChainMock();
      challanChain.single = vi.fn().mockResolvedValue({
        data: {
          id: CHALLAN_ID,
          status: "cancelled",
          sales: { id: SALE_ID, sale_items: [] },
        },
        error: null,
      });
      fromChains["challans"] = challanChain;

      await expect(
        challanService.cancelChallan(CHALLAN_ID, DEALER_ID)
      ).rejects.toThrow("Cannot cancel this challan");
    });
  });

  // ── CHALLAN LIST ─────────────────────────────────────────

  describe("Challan Listing", () => {
    it("lists challans for a dealer", async () => {
      const challanChain = createChainMock();
      challanChain.order = vi.fn().mockResolvedValue({
        data: [
          { id: "ch-1", challan_no: "CH-00001", status: "pending" },
          { id: "ch-2", challan_no: "CH-00002", status: "delivered" },
        ],
        error: null,
      });
      fromChains["challans"] = challanChain;

      const result = await challanService.list(DEALER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].challan_no).toBe("CH-00001");
    });

    it("returns empty array when no challans exist", async () => {
      const challanChain = createChainMock();
      challanChain.order = vi.fn().mockResolvedValue({ data: [], error: null });
      fromChains["challans"] = challanChain;

      const result = await challanService.list(DEALER_ID);
      expect(result).toEqual([]);
    });
  });

  // ── ERROR HANDLING ───────────────────────────────────────

  describe("Error Handling", () => {
    it("challan.create throws on sale not found", async () => {
      const salesChain = createChainMock();
      salesChain.single = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
      fromChains["sales"] = salesChain;

      await expect(
        challanService.create({ dealer_id: DEALER_ID, sale_id: "bad-id", challan_date: "2026-02-22" })
      ).rejects.toThrow("Sale not found");
    });

    it("challan.markDelivered throws on challan not found", async () => {
      const challanChain = createChainMock();
      challanChain.single = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
      fromChains["challans"] = challanChain;

      await expect(
        challanService.markDelivered("bad-id", DEALER_ID)
      ).rejects.toThrow("Challan not found");
    });

    it("challan.convertToInvoice throws on sale not found", async () => {
      const salesChain = createChainMock();
      salesChain.single = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
      fromChains["sales"] = salesChain;

      await expect(
        challanService.convertToInvoice("bad-id", DEALER_ID)
      ).rejects.toThrow("Sale not found");
    });

    it("challan.cancelChallan throws on challan not found", async () => {
      const challanChain = createChainMock();
      challanChain.single = vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } });
      fromChains["challans"] = challanChain;

      await expect(
        challanService.cancelChallan("bad-id", DEALER_ID)
      ).rejects.toThrow("Challan not found");
    });
  });
});
