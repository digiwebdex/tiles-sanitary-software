import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MoreHorizontal, Eye, Pencil, Copy, Trash2, Lock } from "lucide-react";

export interface ProductActionHandlers {
  onViewDetails: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  onReserve?: () => void;
  showReserve?: boolean;
}

const ProductActionDropdown = ({
  onViewDetails, onEdit, onDuplicate, onDelete, canDelete, onReserve, showReserve,
}: ProductActionHandlers) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <MoreHorizontal className="h-4 w-4" />
          <span>Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onViewDetails}>
          <Eye className="mr-2 h-4 w-4" /> View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" /> Edit Product
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate Product
        </DropdownMenuItem>
        {showReserve && onReserve && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onReserve}>
              <Lock className="mr-2 h-4 w-4" /> Reserve Stock
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        {canDelete ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete Product
          </DropdownMenuItem>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <DropdownMenuItem disabled className="opacity-50">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Product
                </DropdownMenuItem>
              </div>
            </TooltipTrigger>
            <TooltipContent side="left">
              Cannot delete product with transaction history
            </TooltipContent>
          </Tooltip>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProductActionDropdown;
