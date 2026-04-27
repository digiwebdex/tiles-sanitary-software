/**
 * Super Admin → "View as Dealer" impersonation.
 *
 * Pure client-side scoping: when an SA picks a dealer to inspect, we
 * stash {dealerId, dealerName} in localStorage. AuthContext reads it
 * and overrides `profile.dealer_id` for that session so every page,
 * hook (`useDealerId`), and service that depends on the auth context
 * naturally scopes to the chosen dealer's data.
 *
 * Backend safety: the SA's JWT still carries the `super_admin` role,
 * so all `/api/*` reads + writes are authorized — we're only changing
 * which `dealer_id` the frontend asks about. No new tokens are minted.
 *
 * The "edit" flag controls whether write actions are allowed in the UI
 * (read-only by default to prevent accidental SA edits).
 */

const KEY = "sa.viewAs";
const EVT = "sa-view-as-change";

export interface SaImpersonation {
  dealerId: string;
  dealerName: string;
  editable: boolean;
}

function read(): SaImpersonation | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaImpersonation>;
    if (!parsed?.dealerId) return null;
    return {
      dealerId: parsed.dealerId,
      dealerName: parsed.dealerName ?? "Dealer",
      editable: !!parsed.editable,
    };
  } catch {
    return null;
  }
}

function write(value: SaImpersonation | null) {
  try {
    if (value) {
      localStorage.setItem(KEY, JSON.stringify(value));
    } else {
      localStorage.removeItem(KEY);
    }
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* ignore quota errors */
  }
}

export const saImpersonation = {
  get(): SaImpersonation | null {
    return read();
  },
  start(dealerId: string, dealerName: string, editable = false) {
    write({ dealerId, dealerName, editable });
  },
  setEditable(editable: boolean) {
    const current = read();
    if (!current) return;
    write({ ...current, editable });
  },
  clear() {
    write(null);
  },
  /** Subscribe to changes (in this tab + cross-tab via 'storage' event). */
  subscribe(cb: () => void): () => void {
    const onChange = () => cb();
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) cb();
    };
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  },
};

export const SA_IMPERSONATION_EVENT = EVT;
