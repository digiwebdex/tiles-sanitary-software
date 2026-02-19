import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

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

function computeAccessLevel(sub: Subscription | null, isSuperAdmin: boolean): AccessLevel {
  if (isSuperAdmin) return "full";
  if (!sub) return "blocked";
  if (sub.status === "active") return "full";
  if (sub.status === "suspended") return "blocked";

  // expired — check grace period (3 days)
  if (sub.end_date) {
    const endDate = new Date(sub.end_date);
    const graceEnd = new Date(endDate);
    graceEnd.setDate(graceEnd.getDate() + 3);
    const now = new Date();

    if (now <= graceEnd) return "grace";
  }

  return "readonly";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = roles.some((r) => r.role === "super_admin");
  const isDealerAdmin = roles.some((r) => r.role === "dealer_admin");
  const accessLevel = computeAccessLevel(subscription, isSuperAdmin);

  async function loadUserData(userId: string) {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    const prof = profileRes.data as Profile | null;
    setProfile(prof);
    setRoles((rolesRes.data as UserRole[]) ?? []);

    // Load subscription for dealer
    if (prof?.dealer_id) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("dealer_id", prof.dealer_id)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSubscription(sub as Subscription | null);
    } else {
      setSubscription(null);
    }
  }

  useEffect(() => {
    let isMounted = true;
    let initialized = false;

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
        console.error("Auth init error:", err);
      } finally {
        if (isMounted) {
          initialized = true;
          setLoading(false);
        }
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
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setSubscription(null);
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
