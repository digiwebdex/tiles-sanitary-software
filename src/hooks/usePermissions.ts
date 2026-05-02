import { useAuth } from "@/contexts/AuthContext";

export interface Permissions {
  canViewCostPrice: boolean;
  canViewProfit: boolean;
  canViewMargin: boolean;
  canEditPrices: boolean;
  canAdjustStock: boolean;
  canOverrideCredit: boolean;
  canRecordCollections: boolean;
  canDeleteRecords: boolean;
  canExportReports: boolean;
  canManageUsers: boolean;
  canViewSupplierLedger: boolean;
  canViewExpenseLedger: boolean;
  canViewFinancialDashboard: boolean;
  /**
   * Demo accounts can VIEW everything but cannot mutate anything.
   * `canMutate` is the umbrella flag for forms, save buttons, and any
   * action that would create/update/delete data. Use it in addition to
   * any role-based check on UI mutations.
   */
  canMutate: boolean;
  isDealerAdmin: boolean;
  isSalesman: boolean;
  isSuperAdmin: boolean;
  isDemo: boolean;
}

export function usePermissions(): Permissions {
  const { roles, isSuperAdmin, isDealerAdmin, isDemo } = useAuth();
  const isSalesman = roles.some((r) => r.role === "salesman");

  // Dealer admin and super admin get full access
  const isPrivileged = isDealerAdmin || isSuperAdmin;

  // Demo blocks all mutations regardless of role (super_admin never carries
  // the demo flag — the backend strips it for super_admin tokens).
  const canMutate = !isDemo;

  return {
    canViewCostPrice: isPrivileged,
    canViewProfit: isPrivileged,
    canViewMargin: isPrivileged,
    canEditPrices: isPrivileged && canMutate,
    canAdjustStock: isPrivileged && canMutate,
    canOverrideCredit: isPrivileged && canMutate,
    canRecordCollections: isPrivileged && canMutate,
    canDeleteRecords: isPrivileged && canMutate,
    canExportReports: isPrivileged,
    canManageUsers: isPrivileged && canMutate,
    canViewSupplierLedger: isPrivileged,
    canViewExpenseLedger: isPrivileged,
    canViewFinancialDashboard: isPrivileged,
    canMutate,
    isDealerAdmin,
    isSalesman,
    isSuperAdmin,
    isDemo,
  };
}
