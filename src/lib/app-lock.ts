/**
 * App lock (Android only): covers the social apps the user picked until they
 * spend coins on a timed pass. The native half is in modules/app-lock; it is
 * missing on iOS, web and Expo Go, where `appLock` is null.
 */
import { requireOptionalNativeModule } from "expo";
import type { AppPassState } from "@/api/types";

export interface LockStatus {
  usageAccess: boolean;
  overlay: boolean;
  enabled: boolean;
  blocked: string[];
  remainingMs: number;
}

interface AppLockModule {
  getStatus(): LockStatus;
  getInstalledApps(): Promise<{ id: string; label: string }[]>;
  openUsageAccessSettings(): void;
  openOverlaySettings(): void;
  setBlocked(ids: string[]): void;
  setUnlockedFor(ms: number): void;
  setEnabled(enabled: boolean): void;
}

export const appLock = requireOptionalNativeModule<AppLockModule>("AppLock");

/** Hand the server's pass to the device as "time left", so a wrong phone clock doesn't matter. */
export function applyPass(pass: Pick<AppPassState, "expiresAt" | "serverNow">) {
  appLock?.setUnlockedFor(pass.expiresAt ? Math.max(0, Date.parse(pass.expiresAt) - Date.parse(pass.serverNow)) : 0);
}
