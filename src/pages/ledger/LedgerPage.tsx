import LedgerPageContent from "@/modules/ledger/LedgerPageContent";

const TEMP_DEALER_ID = "00000000-0000-0000-0000-000000000000";

const LedgerPage = () => (
  <div className="container mx-auto max-w-5xl p-6">
    <LedgerPageContent dealerId={TEMP_DEALER_ID} />
  </div>
);

export default LedgerPage;
