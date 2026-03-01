import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye, FileText, CreditCard, Truck, Pencil, Trash2, MoreHorizontal,
} from "lucide-react";

export interface SaleActionHandlers {
  saleId: string;
  hasPaid: boolean;
  hasDelivery: boolean;
  isDelivered: boolean;
  onViewSale: () => void;
  onAddPayment: () => void;
  onViewInvoice: () => void;
  onViewDeliveryStatus: () => void;
  onAddDelivery: () => void;
  onEditSale: () => void;
  onDeleteSale: () => void;
}

const SaleActionDropdown = (props: SaleActionHandlers) => {
  const {
    hasPaid, hasDelivery, isDelivered,
    onViewSale, onAddPayment, onViewInvoice, onViewDeliveryStatus,
    onAddDelivery, onEditSale, onDeleteSale,
  } = props;

  const canEdit = !hasPaid && !isDelivered;
  const canDelete = !hasPaid && !hasDelivery && !isDelivered;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onViewSale}>
          <Eye className="mr-2 h-4 w-4" /> View Sale
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAddPayment}>
          <CreditCard className="mr-2 h-4 w-4" /> Add Payment
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewInvoice}>
          <FileText className="mr-2 h-4 w-4" /> View Invoice
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewDeliveryStatus}>
          <Truck className="mr-2 h-4 w-4" /> Delivery Status
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAddDelivery}>
          <Truck className="mr-2 h-4 w-4" /> Add Delivery
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onEditSale} disabled={!canEdit} className={!canEdit ? "opacity-50" : ""}>
          <Pencil className="mr-2 h-4 w-4" /> {canEdit ? "Edit Sale" : "Edit (Locked)"}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canDelete}
          className={!canDelete ? "opacity-50" : "text-destructive focus:text-destructive"}
          onClick={() => { if (canDelete) onDeleteSale(); }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {canDelete ? "Delete Sale" : "Cannot Delete"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SaleActionDropdown;
