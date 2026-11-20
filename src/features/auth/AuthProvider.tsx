import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import type { Role } from "../../lib/types";

export type AuthState =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "mfa_required"; email: string }
  | { kind: "unauthorized"; email: string }
  | { kind: "error"; message: string }
  | { kind: "authorized"; userId: string; email: string; role: Role; displayName: string | null };

interface AuthCtx {
  state: AuthState;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/**
 * Resolve what the signed-in person may see. A failure to verify is its own state and never grants
 * access. The frontend gate is UX only: every table and function re-checks is_owner() in Postgres.
 */
export async function resolveAuth(session: Session | null): Promise<AuthState> {
  if (!session) return { kind: "signed_out" };
  const email = session.user.email ?? "";

  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.error) return { kind: "error", message: "Couldn't check your sign-in security level. Reload to try again." };
  if (aal.data.nextLevel === "aal2" && aal.data.currentLevel !== "aal2") return { kind: "mfa_required", email };

  const { data, error } = await supabase
    .from("staff")
    .select("role, is_active, display_name")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) return { kind: "error", message: "Couldn't verify your account. Check your connection and reload." };
  if (!data || !data.is_active || data.role !== "owner") return { kind: "unauthorized", email };
  return { kind: "authorized", userId: session.user.id, email, role: data.role as Role, displayName: data.display_name };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setState(await resolveAuth(data.session));
  }, []);

  useEffect(() => {
    let live = true;
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!live || event === "INITIAL_SESSION") return;
      // Defer: never await Supabase calls inside the auth callback itself.
      setTimeout(() => { resolveAuth(session).then((s) => live && setState(s)); }, 0);
    });
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, [refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ kind: "signed_out" });
  }, []);

  const value = useMemo(() => ({ state, refresh, signOut }), [state, refresh, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
