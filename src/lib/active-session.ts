/**
 * Device-side state for the workout in progress — everything the server
 * session doesn't model: which exercise is in focus, what was skipped or
 * deferred ("machine busy"), AMRAP flags, pause bookkeeping and the rest timer.
 *
 * The website keeps the whole session in localStorage; here the server owns the
 * sets and this store owns the flow. It's persisted per session id so leaving
 * the screen, backgrounding or killing the app resumes exactly where you were.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ExercisePerformance, WorkoutSession } from "@/api/types";
import { readRaw, removeKey, writeJSON } from "./storage";

export interface ActiveUI {
  /** performance id in focus */
  cursor: string | null;
  skipped: string[];
  /** perfId → reason ("machine busy", "do later") */
  deferred: Record<string, string>;
  /** `${perfId}:${setNumber}` keys flagged as AMRAP */
  amrap: string[];
  paused: boolean;
  pausedAt: number | null;
  pausedMs: number;
  restEndsAt: number | null;
  restTotal: number;
  /** perfId → name it replaced, for the "swapped from" label */
  swappedFrom: Record<string, string>;
  /** perfId → number of set slots shown (planned + added). Only completed sets live on the server. */
  planned: Record<string, number>;
  /** `${perfId}:${setNumber}` → values typed into a set that isn't logged yet */
  drafts: Record<string, SetDraft>;
  /** perfId → "3 × 8–12" style target from the plan */
  targets: Record<string, string>;
}

export interface SetDraft {
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  warmup?: boolean;
}

export const EMPTY_UI: ActiveUI = {
  cursor: null,
  skipped: [],
  deferred: {},
  amrap: [],
  paused: false,
  pausedAt: null,
  pausedMs: 0,
  restEndsAt: null,
  restTotal: 90,
  swappedFrom: {},
  planned: {},
  drafts: {},
  targets: {},
};

const key = (id: string) => `forma.active.${id}`;
const cache = new Map<string, ActiveUI>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export async function loadActiveUI(id: string): Promise<ActiveUI> {
  const hit = cache.get(id);
  if (hit) return hit;
  const stored = await readRaw<ActiveUI>(key(id));
  const ui = { ...EMPTY_UI, ...(stored ?? {}) };
  cache.set(id, ui);
  emit();
  return ui;
}

export function getActiveUI(id: string): ActiveUI {
  return cache.get(id) ?? EMPTY_UI;
}

export function updateActiveUI(id: string, fn: (ui: ActiveUI) => ActiveUI) {
  const next = fn(getActiveUI(id));
  cache.set(id, next);
  writeJSON(key(id), next);
  emit();
}

export function clearActiveUI(id: string) {
  cache.delete(id);
  removeKey(key(id));
  emit();
}

/** Subscribe to one session's UI state (loads it from storage on first use). */
export function useActiveUI(id: string | null | undefined): ActiveUI {
  const [, setReady] = useState(false);
  useEffect(() => {
    if (id) void loadActiveUI(id).then(() => setReady(true));
  }, [id]);
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => version,
    () => version,
  );
  return id ? getActiveUI(id) : EMPTY_UI;
}

// ── derived helpers over the server session + UI flow ───────────────────────
export interface SetRow {
  n: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  warmup: boolean;
  done: boolean;
  amrap: boolean;
  /** a server row exists for this set number */
  saved: boolean;
}

export const setKey = (perfId: string, n: number) => `${perfId}:${n}`;

/** Server sets (completed) merged with on-device planned/draft slots, in set order. */
export function setRows(p: ExercisePerformance, ui: ActiveUI): SetRow[] {
  const maxServer = Math.max(0, ...p.sets.map((s) => s.setNumber));
  const count = Math.max(ui.planned[p.id] ?? 0, maxServer, p.sets.length ? 0 : 1);
  const rows: SetRow[] = [];
  for (let n = 1; n <= count; n++) {
    const srv = p.sets.find((s) => s.setNumber === n);
    const d = ui.drafts[setKey(p.id, n)];
    rows.push({
      n,
      weightKg: d?.weightKg !== undefined && !srv?.completedAt ? d.weightKg : srv?.weightKg ?? d?.weightKg ?? null,
      reps: d?.reps !== undefined && !srv?.completedAt ? d.reps : srv?.reps ?? d?.reps ?? null,
      rpe: d?.rpe !== undefined && !srv?.completedAt ? d.rpe : srv?.rpe ?? d?.rpe ?? null,
      warmup: srv?.completedAt ? srv.isWarmup : d?.warmup ?? srv?.isWarmup ?? false,
      done: !!srv?.completedAt,
      amrap: ui.amrap.includes(setKey(p.id, n)),
      saved: !!srv,
    });
  }
  return rows;
}

export const workingRows = (p: ExercisePerformance, ui: ActiveUI) => setRows(p, ui).filter((r) => !r.warmup);

export function exerciseComplete(p: ExercisePerformance, ui: ActiveUI): boolean {
  const w = workingRows(p, ui);
  return w.length > 0 && w.every((r) => r.done);
}

/** First set (warmups included) that isn't done yet. */
export function activeRow(p: ExercisePerformance, ui: ActiveUI): SetRow | null {
  return setRows(p, ui).find((r) => !r.done) ?? null;
}

export type Phase = "done" | "active" | "deferred" | "skipped" | "pending";

export function phaseOf(p: ExercisePerformance, ui: ActiveUI): Phase {
  if (ui.skipped.includes(p.id)) return "skipped";
  if (exerciseComplete(p, ui)) return "done";
  if (ui.deferred[p.id]) return "deferred";
  if (ui.cursor === p.id) return "active";
  return "pending";
}

export const sortedPerfs = (session: WorkoutSession) => [...session.performances].sort((a, b) => a.order - b.order);

/** Next perf to focus: first unfinished, non-skipped, non-deferred after `after`; then wrap; then deferred ones. */
export function nextFocus(session: WorkoutSession, ui: ActiveUI, after?: string | null): string | null {
  const perfs = sortedPerfs(session);
  const open = perfs.filter((p) => !ui.skipped.includes(p.id) && !exerciseComplete(p, ui));
  if (!open.length) return null;
  const notDeferred = open.filter((p) => !ui.deferred[p.id]);
  if (after) {
    const idx = perfs.findIndex((p) => p.id === after);
    const later = notDeferred.find((p) => perfs.indexOf(p) > idx);
    if (later) return later.id;
  }
  return (notDeferred[0] ?? open[0]).id;
}

/** Superset peers (same supersetGroup), in order. */
export function supersetPeers(session: WorkoutSession, perf: ExercisePerformance): ExercisePerformance[] {
  if (perf.supersetGroup == null) return [perf];
  return sortedPerfs(session).filter((p) => p.supersetGroup === perf.supersetGroup);
}

export const supersetLetter = (g: number) => String.fromCharCode(64 + Math.min(26, Math.max(1, g)));

export function elapsedSec(session: Pick<WorkoutSession, "startedAt">, ui: ActiveUI, now = Date.now()) {
  const extra = ui.paused && ui.pausedAt ? now - ui.pausedAt : 0;
  return Math.max(0, Math.floor((now - Date.parse(session.startedAt) - ui.pausedMs - extra) / 1000));
}

export function progressOf(session: WorkoutSession, ui: ActiveUI) {
  const live = session.performances.filter((p) => !ui.skipped.includes(p.id));
  const rows = live.flatMap((p) => workingRows(p, ui));
  return {
    setsDone: rows.filter((r) => r.done).length,
    setsTotal: rows.length,
    exercisesDone: live.filter((p) => exerciseComplete(p, ui)).length,
    exercisesTotal: live.length,
  };
}

export const epley1RM = (w: number, r: number) => (r <= 0 ? 0 : r === 1 ? w : Math.round(w * (1 + r / 30)));
