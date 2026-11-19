/**
 * Small JSON wrapper over AsyncStorage for device-local state (preferences,
 * drafts, reward idempotency keys, the active-workout UI state). Every call is
 * failure-tolerant: storage being unavailable must never break a screen.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? ({ ...(fallback as object), ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function readRaw<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

export function removeKey(key: string): void {
  AsyncStorage.removeItem(key).catch(() => {});
}

/** Wipe every device-local Forma key (sign-out / account deletion). */
export async function clearForma(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("forma."));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    /* ignore */
  }
}
