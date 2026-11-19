import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth as authClient, session as tokenStore } from "@/api/client";
import { invalidateResource } from "@/api/hooks";
import { setRewardsUser } from "@/lib/rewards";
import type { User } from "@/api/types";

export type AuthStatus = "loading" | "authed" | "unverified" | "anon";

interface AuthValue {
  status: AuthStatus;
  user: User | null;
  setUser: (u: User | null) => void;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

const statusFor = (u: User | null): AuthStatus => (!u ? "anon" : u.emailVerified ? "authed" : "unverified");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUserState] = useState<User | null>(null);

  const setUser = useCallback((u: User | null) => {
    setUserState((prev) => {
      // a different (or no) account: drop every cached screen so nothing leaks across users
      if (prev?.id !== u?.id) invalidateResource();
      return u;
    });
    setRewardsUser(u?.id ?? null);
    setStatus(statusFor(u));
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await authClient.me());
    } catch {
      setUser(null);
    }
  }, [setUser]);

  // Restore the session from the keychain on launch.
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await tokenStore.restore();
      if (!alive) return;
      if (!ok) return setUser(null);
      await refreshUser();
    })();
    return () => {
      alive = false;
    };
  }, [refreshUser, setUser]);

  // A failed refresh anywhere drops us back to the login screen.
  useEffect(
    () =>
      tokenStore.onChange((authed) => {
        if (!authed) setUser(null);
      }),
    [setUser],
  );

  const signOut = useCallback(async () => {
    try {
      await authClient.logout();
    } catch {
      /* already gone server-side */
    }
    tokenStore.clear();
    setUser(null);
  }, [setUser]);

  const signOutEverywhere = useCallback(async () => {
    try {
      await authClient.logoutAll();
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setUser(null);
  }, [setUser]);

  const value = useMemo(
    () => ({ status, user, setUser, refreshUser, signOut, signOutEverywhere }),
    [status, user, setUser, refreshUser, signOut, signOutEverywhere],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
