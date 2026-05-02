import { useAuth } from "@/contexts/AuthContext";
import { Eye } from "lucide-react";

/**
 * Sticky top banner shown to every demo-account user. Makes it obvious that
 * the data is read-only and prompts them to sign up for their own account.
 */
export function DemoBanner() {
  const { isDemo } = useAuth();
  if (!isDemo) return null;

  return (
    <div className="sticky top-0 z-50 w-full bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-sm font-medium">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="text-center">
          You're viewing a <strong>read-only demo account</strong>. Explore freely — nothing can be saved or changed.
        </span>
      </div>
    </div>
  );
}
