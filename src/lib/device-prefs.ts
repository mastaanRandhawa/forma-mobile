/**
 * Preferences that live on this device only — the website keeps the same
 * things in localStorage (preferred training days, reminder time). The API has
 * no field for them, so they're not synced across devices.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { readJSON, writeJSON } from "./storage";

export interface DevicePrefs {
  /** 0 = Sunday … 6 = Saturday */
  preferredDays: number[];
  reminderHour: number;
  reminderMinute: number;
  /** last time the push-permission explainer was shown (ms) */
  pushAskedAt: number | null;
  /** tab bar: shrink while scrolling down ("auto"), or stay full / compact */
  navMode?: "auto" | "expanded" | "minimized";
  /** active workout: show the elapsed-time clock (hidden by default) */
  workoutClock?: boolean;
  /** active workout: always show the rest countdown digits (otherwise only the bar, plus the last 10 s) */
  restCountdown?: boolean;
}

const KEY = "forma.device-prefs.v1";
const DEFAULTS: DevicePrefs = { preferredDays: [1, 3, 5], reminderHour: 17, reminderMinute: 30, pushAskedAt: null };
let state: DevicePrefs = DEFAULTS;
let loaded = false;
let loading: Promise<DevicePrefs> | null = null;
const listeners = new Set<() => void>();

export function loadDevicePrefs(): Promise<DevicePrefs> {
  loading ??= readJSON(KEY, DEFAULTS).then((s) => {
    state = s;
    loaded = true;
    listeners.forEach((l) => l());
    return s;
  });
  return loading;
}

export function getDevicePrefs() {
  return state;
}

export function setDevicePrefs(patch: Partial<DevicePrefs>) {
  state = { ...state, ...patch };
  writeJSON(KEY, state);
  listeners.forEach((l) => l());
}

export function useDevicePrefs(): DevicePrefs & { loaded: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    if (!loaded) void loadDevicePrefs().then(() => force((n) => n + 1));
  }, []);
  const snap = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => state,
    () => state,
  );
  return { ...snap, loaded };
}
