import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import {
  bindAuthUser,
  getPortalContext,
  touchLastLogin,
  type PortalContext,
} from "@/services/portalService";

interface PortalAuthValue {
  user: User | null;
  session: Session | null;
  context: PortalContext | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<PortalAuthValue | null>(null);

export function usePortalAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePortalAuth must be used within PortalAuthProvider");
  return v;
}

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [context, setContext] = useState<PortalContext | null>(null);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(true);

  async function loadContext() {
    // Bind auth user → portal_users row by email (idempotent)
    await bindAuthUser();
    await touchLastLogin();
    const ctx = await getPortalContext();
    setContext(ctx);
  }

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) await loadContext();
      } finally {
        if (mounted) {
          initRef.current = false;
          setLoading(false);
        }
      }
    };
    init();

    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!mounted) return;
        if (initRef.current) return;
        setLoading(true);
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          setTimeout(async () => {
            if (!mounted) return;
            try {
              await loadContext();
            } finally {
              if (mounted) setLoading(false);
            }
          }, 0);
        } else {
          setContext(null);
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      sub.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setContext(null);
  };

  return (
    <Ctx.Provider value={{ user, session, context, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
