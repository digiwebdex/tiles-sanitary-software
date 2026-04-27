/**
 * Banner shown across the ERP when a Super Admin is "viewing as" a dealer.
 * Provides:
 *   - Identity of the dealer being viewed
 *   - "Edit mode" toggle (off by default → SA inspects without risk)
 *   - "Exit" button to clear impersonation and return to /super-admin
 */
import { useNavigate } from "react-router-dom";
import { Eye, LogOut, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { saImpersonation } from "@/lib/saImpersonation";
import { useEffect, useState } from "react";

export const SAImpersonationBanner = () => {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [, force] = useState(0);

  useEffect(() => saImpersonation.subscribe(() => force((v) => v + 1)), []);

  const impersonation = isSuperAdmin ? saImpersonation.get() : null;
  if (!impersonation) return null;

  const exit = () => {
    saImpersonation.clear();
    navigate("/super-admin/dealers");
  };

  return (
    <div className="sticky top-0 z-30 border-b border-amber-300/60 bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="font-semibold">Super Admin view</span>
          <span className="text-amber-800/80 dark:text-amber-200/80 truncate">
            — Viewing ERP as <b className="font-semibold">{impersonation.dealerName}</b>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Pencil className="h-3.5 w-3.5" />
            <span className="text-xs">Edit mode</span>
            <Switch
              checked={impersonation.editable}
              onCheckedChange={(v) => saImpersonation.setEditable(!!v)}
            />
          </label>
          <Button size="sm" variant="outline" onClick={exit} className="border-amber-400 bg-transparent hover:bg-amber-200/60 dark:hover:bg-amber-900/40">
            <LogOut className="h-3.5 w-3.5 mr-1" />
            Exit
          </Button>
        </div>
      </div>
      {!impersonation.editable && (
        <div className="px-4 pb-1.5 text-xs text-amber-800/80 dark:text-amber-200/70">
          Read-only inspection. Toggle <b>Edit mode</b> to make changes — every action is logged under your Super Admin account.
        </div>
      )}
    </div>
  );
};

export default SAImpersonationBanner;
