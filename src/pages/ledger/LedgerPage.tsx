import LedgerPageContent from "@/modules/ledger/LedgerPageContent";
import { useDealerId } from "@/hooks/useDealerId";

const LedgerPage = () => {
  // P0 hardening: was hardcoded TEMP_DEALER_ID — now resolved from auth context.
  // useDealerId() throws for non-super_admin users without a dealer link.
  const dealerId = useDealerId();

  if (!dealerId) {
    return (
      <div className="container mx-auto max-w-5xl p-6">
        <p className="text-sm text-muted-foreground">
          Select a dealer to view ledgers.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <LedgerPageContent dealerId={dealerId} />
    </div>
  );
};

export default LedgerPage;
