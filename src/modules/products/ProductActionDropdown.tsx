import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal, Eye, Image, BarChart3, ArrowLeftRight,
  ShoppingCart, TrendingUp, Pencil, Copy, DollarSign, Tag,
  QrCode, Package, Barcode, Printer, CreditCard, FileText,
  Power, AlertTriangle as ReorderIcon, Trash2, History,
} from "lucide-react";

export interface ProductActionHandlers {
  onViewDetails: () => void;
  onViewStockSummary: () => void;
  onViewStockMovement: () => void;
  onViewPurchaseHistory: () => void;
  onViewSalesHistory: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onUpdateSalePrice: () => void;
  onUpdateCostPrice: () => void;
  onChangeBarcode: () => void;
  onAdjustStock: () => void;
  onPrintBarcode: () => void;
  onToggleActive: () => void;
  onSetReorderLevel: () => void;
  onMarkBroken: () => void;
  onDelete: () => void;
  isActive: boolean;
  hasTx: boolean;
}

const ProductActionDropdown = (props: ProductActionHandlers) => {
  const {
    onViewDetails, onViewStockSummary, onViewStockMovement, onViewPurchaseHistory, onViewSalesHistory,
    onEdit, onDuplicate, onUpdateSalePrice, onUpdateCostPrice, onChangeBarcode,
    onAdjustStock, onPrintBarcode, onToggleActive, onSetReorderLevel, onMarkBroken,
    onDelete, isActive, hasTx,
  } = props;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* VIEW */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">🔎 View</DropdownMenuLabel>
        <DropdownMenuItem onClick={onViewDetails}>
          <Eye className="mr-2 h-4 w-4" /> Product Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewStockSummary}>
          <BarChart3 className="mr-2 h-4 w-4" /> View Stock Summary
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewStockMovement}>
          <ArrowLeftRight className="mr-2 h-4 w-4" /> View Stock Movement
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewPurchaseHistory}>
          <ShoppingCart className="mr-2 h-4 w-4" /> View Purchase History
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onViewSalesHistory}>
          <TrendingUp className="mr-2 h-4 w-4" /> View Sales History
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* EDIT */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">✏️ Edit</DropdownMenuLabel>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" /> Edit Product
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate Product
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onUpdateSalePrice}>
          <DollarSign className="mr-2 h-4 w-4" /> Update Sale Price
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onUpdateCostPrice}>
          <Tag className="mr-2 h-4 w-4" /> Update Cost Price
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onChangeBarcode}>
          <QrCode className="mr-2 h-4 w-4" /> Change Barcode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAdjustStock}>
          <Package className="mr-2 h-4 w-4" /> Adjust Stock
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMarkBroken}>
          <History className="mr-2 h-4 w-4" /> Mark Broken
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* PRINT */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">🖨 Print</DropdownMenuLabel>
        <DropdownMenuItem onClick={onPrintBarcode}>
          <Barcode className="mr-2 h-4 w-4" /> Print Barcode / Label
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* CONTROL */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">⚙ Control</DropdownMenuLabel>
        <DropdownMenuItem onClick={onToggleActive}>
          <Power className="mr-2 h-4 w-4" /> {isActive ? "Deactivate Product" : "Activate Product"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSetReorderLevel}>
          <ReorderIcon className="mr-2 h-4 w-4" /> Set Reorder Level
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* DANGER */}
        <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">🗑 Danger</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={hasTx}
          className={hasTx ? "opacity-50" : "text-destructive focus:text-destructive"}
          onClick={() => { if (!hasTx) onDelete(); }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {hasTx ? "Cannot Delete (Has Txns)" : "Delete Product"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProductActionDropdown;
