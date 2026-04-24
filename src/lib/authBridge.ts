/**
 * Single frontend auth access layer (Phase 1).
 *
 * Rules:
 *   - All NEW auth code must call authBridge — never import supabase.auth
 *     or vpsAuthClient directly.
 *   - The active backend is selected by env.AUTH_BACKEND
 *     ("supabase" default, "vps" rollout).
 *   - Existing Supabase-backed `useAuth()` continues to work for data RLS
 *     (Phase 2 will swap data clients). Only the auth ACTIONS funnel here.
 *
 * Rollback: set VITE_AUTH_BACKEND=supabase, rebuild, redeploy. No code edits.
 */
import { supabase } from "@/integrations/supabase/client";
import { env } from "./env";
import {
  vpsAuthApi,
  vpsTokenStore,
  type LockStatus,
  type VpsUser,
} from "./vpsAuthClient";

export type { LockStatus, VpsUser };

export interface SignInResult {
  success: boolean;
  /** Lock state after the attempt — drives Bengali lockout UX. */
  lock?: LockStatus;
  /** Optional human message for error toasts. */
  message?: string;
  /** Error code (LOCKED | INVALID_CREDENTIALS | SUSPENDED | …). */
  code?: string;
}

export interface SignUpInput {
  name: string;
  business_name: string;
  phone: string;
  email: string;
  password: string;
}

export interface SignUpResult {
  success: boolean;
  message?: string;
  code?: string;
}

export const authBridge = {
  backend: env.AUTH_BACKEND,
  isVps: env.AUTH_BACKEND === "vps",

  /** Pre-login check; returns lock status without leaking account existence. */
  async getLockStatus(email: string): Promise<LockStatus> {
    if (env.AUTH_BACKEND === "vps") {
      return vpsAuthApi.getLockStatus(email);
    }
    // Supabase path — preserve existing behaviour using server-side RPC.
    try {
      const { data } = await supabase.rpc("check_account_locked", {
        _email: email.trim().toLowerCase(),
      });
      const d = data as { locked: boolean; remaining_minutes?: number; remaining_attempts?: number } | null;
      return d ?? { locked: false };
    } catch {
      return { locked: false };
    }
  },

  /**
   * Sign in. On VPS path stores tokens locally and returns success;
   * the existing Supabase AuthContext is unaware (and won't trigger).
   * On Supabase path delegates to supabase.auth.signInWithPassword and
   * mirrors the legacy lockout RPC handshake.
   */
  async signIn(email: string, password: string): Promise<SignInResult> {
    const normalized = email.trim();

    if (env.AUTH_BACKEND === "vps") {
      try {
        await vpsAuthApi.login(normalized, password);
        return { success: true, lock: { locked: false } };
      } catch (err: any) {
        return {
          success: false,
          code: err.code,
          message: err.message,
          lock: err.lock ?? { locked: false },
        };
      }
    }

    // ── Supabase path (legacy, default until VITE_AUTH_BACKEND=vps) ──
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });

      if (error) {
        const { data: failData } = await supabase.rpc("record_failed_login", {
          _email: normalized.toLowerCase(),
          _ip: null,
        });
        const failResult = failData as
          | { locked: boolean; remaining_attempts?: number }
          | null;

        return {
          success: false,
          code: failResult?.locked ? "LOCKED" : "INVALID_CREDENTIALS",
          message: error.message,
          lock: failResult?.locked
            ? { locked: true, remaining_minutes: 30 }
            : { locked: false, remaining_attempts: failResult?.remaining_attempts ?? 0 },
        };
      }

      await supabase.rpc("record_successful_login", {
        _email: normalized.toLowerCase(),
      });
      return { success: true, lock: { locked: false } };
    } catch (err: any) {
      return { success: false, message: err.message ?? "Login failed" };
    }
  },

  /** Sign out from whichever backend is active. */
  async signOut(): Promise<void> {
    if (env.AUTH_BACKEND === "vps") {
      await vpsAuthApi.logout();
      return;
    }
    await supabase.auth.signOut();
  },

  /**
   * Self-signup. On VPS path provisions dealer + 3-day trial + admin user
   * and stores tokens (auto-login). On Supabase path falls back to the legacy
   * self-signup edge function followed by signInWithPassword for parity.
   */
  async signUp(input: SignUpInput): Promise<SignUpResult> {
    if (env.AUTH_BACKEND === "vps") {
      try {
        await vpsAuthApi.register(input);
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          code: err.code,
          message: err.message ?? "Signup failed",
        };
      }
    }

    // ── Supabase legacy path ────────────────────────────────────────────
    try {
      const { data, error } = await supabase.functions.invoke("self-signup", {
        body: input,
      });
      if (error) return { success: false, message: "Signup failed. Please try again." };
      if (data?.error) return { success: false, message: data.error };

      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      });
      if (loginErr) {
        return {
          success: false,
          message: "Account created but login failed. Please sign in manually.",
        };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message ?? "Signup failed" };
    }
  },

  /** Request a password reset email. Always succeeds (no enumeration). */
  async requestPasswordReset(email: string): Promise<void> {
    if (env.AUTH_BACKEND === "vps") {
      await vpsAuthApi.requestPasswordReset(email.trim());
      return;
    }
    const redirect = `${window.location.origin}/reset-password`;
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect });
  },

  /** Confirm a password reset (VPS only — Supabase uses its own page flow). */
  async confirmPasswordReset(token: string, password: string): Promise<void> {
    if (env.AUTH_BACKEND === "vps") {
      await vpsAuthApi.confirmPasswordReset(token, password);
      return;
    }
    // Supabase path: caller handles updateUser via its own session.
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  },

  /** Snapshot of the active session — for new code that doesn't use the React context yet. */
  getCurrentVpsUser(): VpsUser | null {
    if (env.AUTH_BACKEND !== "vps") return null;
    return vpsTokenStore.user;
  },
};
