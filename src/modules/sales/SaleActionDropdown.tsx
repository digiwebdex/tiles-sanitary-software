import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Eye, FileText, CreditCard, Receipt, MessageSquare,
  Truck, CheckCircle, Printer, Download, Mail,
  Pencil, ArrowRightLeft, Copy, Percent,
  RotateCcw, Trash2, XCircle, Package, MoreHorizontal,
} from "lucide-react";

export interface SaleActionHandlers {
  saleType: string;
  saleStatus: string;
  hasPaid: boolean;
  hasDelivery: boolean;
  hasChallan: boolean;
  // View
  onViewDetails: () => void;
  onViewInvoice: () => void;
  onViewChallan: () => void;
  onViewPayments: () => void;
  onViewDeliveryStatus: () => void;
  // Payment
  onAddPayment: () => void;
  onViewPaymentHistory: () => void;
  onPrintReceipt: () => void;
  onSendReminder: () => void;
  // Delivery
  onAddDelivery: () => void;
  onViewDelivery: () => void;
  onMarkDelivered: () => void;
  onPrintChallan: () => void;
  // Document
  onDownloadInvoice: () => void;
  onDownloadChallan: () => void;
  onEmailInvoice: () => void;
  // Edit
  onEditSale: () => void;
  onConvertToInvoice: () => void;
  onDuplicateSale: () => void;
  // Return
  onReturnFull: () => void;
  onReturnPartial: () => void;
  // Danger
  onCancelSale: () => void;
  onDeleteSale: () => void;
}

const SaleActionDropdown = (props: SaleActionHandlers) => {
  const {
    saleType, saleStatus, hasPaid, hasDelivery, hasChallan,
    onViewDetails, onViewInvoice, onViewChallan, onViewPayments, onViewDeliveryStatus,
    onAddPayment, onViewPaymentHistory, onPrintReceipt, onSendReminder,
    onAddDelivery, onViewDelivery, onMarkDelivered, onPrintChallan,
    onDownloadInvoice, onDownloadChallan, onEmailInvoice,
    onEditSale, onConvertToInvoice, onDuplicateSale,
    onReturnFull, onReturnPartial,
    onCancelSale, onDeleteSale,
  } = props;

  const isChallanMode = saleType === "challan_mode";
  const isInvoiced = saleStatus === "invoiced" || saleStatus === "completed";
  const canEdit = !hasPaid && !isInvoiced;
  const canDelete = !hasPaid && !hasDelivery;
  const canConvert = isChallanMode && saleStatus !== "invoiced" && saleStatus !== "completed";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 max-h-[70vh] overflow-y-auto">
        {/* VIEW */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">🔎 View</DropdownMenuLabel>
        <DropdownMenuItem onClick={onViewDetails}>
          <Eye className="mr-2 h-4 w-4" /> Sale Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewInvoice}>
          <FileText className="mr-2 h-4 w-4" /> View Invoice
        </DropdownMenuItem>
        {isChallanMode && hasChallan && (
          <DropdownMenuItem onClick={onViewChallan}>
            <Package className="mr-2 h-4 w-4" /> View Challan
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onViewPayments}>
          <CreditCard className="mr-2 h-4 w-4" /> View Payments
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewDeliveryStatus}>
          <Truck className="mr-2 h-4 w-4" /> View Delivery Status
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* PAYMENT */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">💰 Payment</DropdownMenuLabel>
        <DropdownMenuItem onClick={onAddPayment}>
          <CreditCard className="mr-2 h-4 w-4" /> Add Payment
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewPaymentHistory}>
          <Receipt className="mr-2 h-4 w-4" /> View Payment History
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPrintReceipt}>
          <Printer className="mr-2 h-4 w-4" /> Print Receipt
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSendReminder}>
          <MessageSquare className="mr-2 h-4 w-4" /> Send Payment Reminder
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* DELIVERY */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">🚚 Delivery</DropdownMenuLabel>
        <DropdownMenuItem onClick={onAddDelivery}>
          <Truck className="mr-2 h-4 w-4" /> Add Delivery
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewDelivery}>
          <Eye className="mr-2 h-4 w-4" /> View Delivery
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMarkDelivered}>
          <CheckCircle className="mr-2 h-4 w-4" /> Mark Delivered
        </DropdownMenuItem>
        {isChallanMode && (
          <DropdownMenuItem onClick={onPrintChallan}>
            <Printer className="mr-2 h-4 w-4" /> Print Challan
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {/* DOCUMENT */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">📄 Document</DropdownMenuLabel>
        <DropdownMenuItem onClick={onDownloadInvoice}>
          <Download className="mr-2 h-4 w-4" /> Download Invoice PDF
        </DropdownMenuItem>
        {isChallanMode && (
          <DropdownMenuItem onClick={onDownloadChallan}>
            <Download className="mr-2 h-4 w-4" /> Download Challan PDF
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onEmailInvoice}>
          <Mail className="mr-2 h-4 w-4" /> Email Invoice
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* EDIT */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">✏️ Edit</DropdownMenuLabel>
        <DropdownMenuItem onClick={onEditSale} disabled={!canEdit} className={!canEdit ? "opacity-50" : ""}>
          <Pencil className="mr-2 h-4 w-4" /> {!canEdit ? "Edit Sale (Locked)" : "Edit Sale"}
        </DropdownMenuItem>
        {canConvert && (
          <DropdownMenuItem onClick={onConvertToInvoice}>
            <ArrowRightLeft className="mr-2 h-4 w-4" /> Convert to Invoice
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onDuplicateSale}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate Sale
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* RETURN */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">↩ Return</DropdownMenuLabel>
        <DropdownMenuItem onClick={onReturnFull}>
          <RotateCcw className="mr-2 h-4 w-4" /> Return Sale (Full)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onReturnPartial}>
          <RotateCcw className="mr-2 h-4 w-4" /> Partial Return
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* DANGER */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">🗑 Danger</DropdownMenuLabel>
        <DropdownMenuItem onClick={onCancelSale} className="text-destructive focus:text-destructive">
          <XCircle className="mr-2 h-4 w-4" /> Cancel Sale
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canDelete}
          className={!canDelete ? "opacity-50" : "text-destructive focus:text-destructive"}
          onClick={() => { if (canDelete) onDeleteSale(); }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {!canDelete ? "Cannot Delete (Has Txns)" : "Delete Sale"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SaleActionDropdown;
