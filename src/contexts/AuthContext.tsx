import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { parseLocalDate } from "@/lib/utils";
import { subLog } from "@/lib/logger";

interface Profile {
  id: string;
  name: string;
  email: string;
  dealer_id: string | null;
  status: string;
}

interface UserRole {
  role: "super_admin" | "dealer_admin" | "salesman";
}

interface Subscription {
  id: string;
  dealer_id: string;
  plan_id: string;
  status: "active" | "expired" | "suspended";
  start_date: string;
  end_date: string | null;
}

export type AccessLevel = "full" | "grace" | "readonly" | "blocked";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: UserRole[];
  subscription: Subscription | null;
  accessLevel: AccessLevel;
  isSuperAdmin: boolean;
  isDealerAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Computes access level based on role and subscription state.
 *
 * Rules:
 *  1. super_admin  → always "full", subscription never checked
 *  2. dealer_admin / salesman with no dealer_id → "blocked"
 *  3. dealer_admin / salesman subscription states → full / grace / readonly / blocked
 *  4. Any other authenticated user (edge case) → "full"
 */
function computeAccessLevel(
  sub: Subscription | null,
  fetchedRoles: UserRole[],
  dealerId: string | null
): AccessLevel {
  const isSuperAdmin = fetchedRoles.some((r) => r.role === "super_admin");
  const isDealerRole = fetchedRoles.some(
    (r) => r.role === "dealer_admin" || r.role === "salesman"
  );

  // Rule 1: super_admin always gets full access — never check subscription
  if (isSuperAdmin) return "full";

  // Rule 2: dealer roles without a dealer_id are blocked
  if (isDealerRole && !dealerId) return "blocked";

  // Rule 3: apply subscription logic for dealer roles
  if (isDealerRole) {
    if (!sub) return "blocked";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Parse end_date as LOCAL midnight (timezone-safe — avoids UTC off-by-one)
    const endDate = parseLocalDate(sub.end_date);

    // Suspended → blocked immediately
    if (sub.status === "suspended") return "blocked";

    // Date is the source of truth: if today <= end_date → full access
    // (regardless of DB status field, which may lag behind)
    if (endDate && today <= endDate) return "full";

    // Grace window: end_date < today <= end_date + 3 days
    if (endDate) {
      const graceEnd = new Date(endDate);
      graceEnd.setDate(graceEnd.getDate() + 3);
      if (today > endDate && today <= graceEnd) return "grace";
    }

    // Beyond grace → readonly
    return "readonly";
  }

  // Rule 4: any other authenticated role gets full access
  return "full";
}

/**
 * Validates and reconciles dealer subscription status against current date.
 * Mutates DB status to "expired" or "active" as needed.
 * Returns the latest subscription record.
 * Retries once on transient network/RLS failures.
 */
async function validateAndSyncSubscription(
  dealerId: string
): Promise<Subscription | null> {
  let sub: Subscription | null = null;
  let fetchError: { message: string } | null = null;

  // Retry up to 2 times for transient failures (network hiccup, cold session)
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("dealer_id", dealerId)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error) {
      sub = data as Subscription | null;
      fetchError = null;
      break;
    }

    fetchError = error;
    subLog.warn(`Subscription fetch attempt ${attempt} failed:`, error.message);

    if (attempt < 2) {
      // Small delay before retry
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (fetchError) {
    subLog.error("Fetch error after retries:", fetchError.message);
    return null;
  }

  if (!sub) {
    subLog.warn("No subscription found for dealer_id:", dealerId);
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse end_date as LOCAL midnight (timezone-safe — avoids UTC off-by-one)
  const endDate = parseLocalDate(sub.end_date);

  // --- Debug logging ---
  subLog.debug("dealer_id     :", dealerId);
  subLog.debug("sub.dealer_id :", sub.dealer_id);
  subLog.debug("status        :", sub.status);
  subLog.debug("end_date      :", sub.end_date ?? "null");
  subLog.debug("current_date  :", today.toISOString().split("T")[0]);
  subLog.debug("parsed endDate:", endDate?.toLocaleDateString() ?? "null");

  // Validate dealer_id match (sanity check)
  if (sub.dealer_id !== dealerId) {
    subLog.error("dealer_id MISMATCH — blocking access.");
    return null;
  }

  if (!endDate) {
    subLog.warn("No end_date on subscription — treating as blocked.");
    return sub as Subscription;
  }

  const graceEnd = new Date(endDate);
  graceEnd.setDate(graceEnd.getDate() + 3);

  // Case 1: Within end_date → ensure status is "active"
  if (today <= endDate) {
    if (sub.status !== "active") {
      await supabase.from("subscriptions").update({ status: "active" }).eq("id", sub.id);
      subLog.info("Status corrected → active");
      return { ...(sub as Subscription), status: "active" };
    }
    subLog.info("Access: FULL (active, end_date:", sub.end_date, ")");
    return sub as Subscription;
  }

  // Case 2: Within grace period (end_date < today <= end_date + 3)
  if (today > endDate && today <= graceEnd) {
    if (sub.status !== "expired") {
      await supabase.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
      subLog.info("Status updated → expired (grace window)");
      return { ...(sub as Subscription), status: "expired" };
    }
    subLog.info("Access: GRACE period");
    return sub as Subscription;
  }

  // Case 3: Beyond grace → expired, block access
  if (sub.status !== "expired") {
    await supabase.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
    subLog.info("Status updated → expired (past grace)");
  }
  subLog.info("Access: BLOCKED (expired past grace)");
  return { ...(sub as Subscription), status: "expired" };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep a ref of loaded roles so we can compute access synchronously
  // inside loadUserData before React re-renders.
  const loadedRolesRef = useRef<UserRole[]>([]);

  const isSuperAdmin = roles.some((r) => r.role === "super_admin");
  const isDealerAdmin = roles.some((r) => r.role === "dealer_admin");
  const accessLevel = computeAccessLevel(subscription, roles, profile?.dealer_id ?? null);

  async function loadUserData(userId: string) {
    // Fetch profile and roles in parallel.
    // Use maybeSingle() for profile to avoid throwing on RLS/network errors.
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (profileRes.error) {
      subLog.error("Profile fetch error:", profileRes.error.message);
    }
    if (rolesRes.error) {
      subLog.error("Roles fetch error:", rolesRes.error.message);
    }

    const prof = profileRes.data as Profile | null;
    const fetchedRoles = (rolesRes.data as UserRole[]) ?? [];

    // Persist in ref for synchronous checks below
    loadedRolesRef.current = fetchedRoles;

    const userIsSuperAdmin = fetchedRoles.some((r) => r.role === "super_admin");
    const userIsDealerRole = fetchedRoles.some(
      (r) => r.role === "dealer_admin" || r.role === "salesman"
    );

    // Set profile & roles together so the first render after loading
    // already has the correct role context.
    setProfile(prof);
    setRoles(fetchedRoles);

    // Only validate subscription for dealer roles with a dealer_id.
    // super_admin path is untouched.
    if (userIsDealerRole && !userIsSuperAdmin && prof?.dealer_id) {
      const validatedSub = await validateAndSyncSubscription(prof.dealer_id);
      setSubscription(validatedSub);
    } else if (userIsDealerRole && !userIsSuperAdmin && !prof?.dealer_id) {
      // Dealer role but no dealer_id — log and block
      subLog.error("Dealer role user has no dealer_id! user_id:", userId);
      setSubscription(null);
    } else {
      // super_admin or no dealer role — no subscription needed
      setSubscription(null);
    }
  }

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await loadUserData(session.user.id);
        }
      } catch (err) {
        subLog.error("Auth init error:", err);
      } finally {
        // Only clear loading after ALL data (profile, roles, subscription) is set.
        // This prevents ProtectedRoute from evaluating with stale/empty state.
        if (isMounted) setLoading(false);
      }
    };

    initialize();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Defer to avoid Supabase auth deadlock
          setTimeout(async () => {
            if (!isMounted) return;
            await loadUserData(session.user.id);
            if (isMounted) setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setSubscription(null);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      authSub.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setSubscription(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        subscription,
        accessLevel,
        isSuperAdmin,
        isDealerAdmin,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
