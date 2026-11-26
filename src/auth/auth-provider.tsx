import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth as authClient, session as tokenStore } from "@/api/client";
import { invalidateResource } from "@/api/hooks";
import type { User } from "@/api/types";
import { appLock } from "@/lib/app-lock";

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

/**
 * Passes can't be bought signed out, so don't leave apps locked behind a login.
 * Called only for a deliberate sign-out: a failed session restore (offline, say)
 * must not switch the lock off.
 */
function releaseAppLock() {
  appLock?.setEnabled(false);
  appLock?.setUnlockedFor(0);
}

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
    releaseAppLock();
    setUser(null);
  }, [setUser]);

  const signOutEverywhere = useCallback(async () => {
    try {
      await authClient.logoutAll();
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    releaseAppLock();
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
