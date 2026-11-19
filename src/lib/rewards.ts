/**
 * Coin economy — ported from the website's lib/rewards.ts + lib/wallet.ts.
 *
 * The backend only awards coins for achievements; everything else (daily
 * check-in, finished workouts, PRs, streak milestones, goals, weekly
 * challenges) is credited by the client through POST /store/wallet/earn — the
 * same contract the website uses. Every grant carries an idempotency key that
 * is remembered on-device so a reward is never paid twice from this phone.
 *
 * Difference from the web: challenge progress is computed from the user's real
 * session history (the web seeds demo progress), and the camera-form challenge
 * is left out because form tracking isn't available on mobile yet.
 */
import { api } from "@/api/client";
import { invalidateResource } from "@/api/hooks";
import type { WorkoutSession } from "@/api/types";
import { toast } from "@/components/ui/toast";
import { readJSON, writeJSON } from "./storage";

type State = { grants: Record<string, string> };
let state: State = { grants: {} };
let userId: string | null = null;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();
const keyFor = () => `forma.rewards.v1.${userId ?? "anon"}`;

/** Grants are remembered per account so a second user on this phone starts clean. */
export function setRewardsUser(id: string | null) {
  if (id === userId) return;
  userId = id;
  state = { grants: {} };
  loaded = null;
}

function load() {
  const key = keyFor();
  loaded ??= readJSON<State>(key, { grants: {} }).then((s) => {
    if (key === keyFor()) state = { grants: s.grants ?? {} };
  });
  return loaded;
}
function save() {
  writeJSON(keyFor(), state);
  listeners.forEach((l) => l());
}

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export function weekKey(d = new Date()) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return `w${m.getFullYear()}-${m.getMonth() + 1}-${m.getDate()}`;
}

/** Credit coins once per `key`. Returns true when coins were actually granted. */
export async function earn(amount: number, label: string, key?: string, silent = false): Promise<boolean> {
  if (amount <= 0) return false;
  await load();
  if (key && state.grants[key]) return false;
  try {
    await api.store.earn(Math.min(1000, Math.round(amount)), label);
  } catch {
    return false; // not granted — the key stays free so it can be retried
  }
  if (key) {
    state.grants[key] = new Date().toISOString();
    save();
  }
  invalidateResource("wallet");
  if (!silent) toast.coins(amount, label);
  return true;
}

export async function hasGrant(key: string) {
  await load();
  return Boolean(state.grants[key]);
}

export function subscribeRewards(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// ── grants ──────────────────────────────────────────────────────────────────
const STREAK_MILESTONES: Record<number, number> = { 3: 30, 7: 70, 14: 120, 30: 220, 60: 320, 100: 400 };

/** Daily check-in bonus — safe to call on every app open. */
export const grantDailyBonus = () => earn(15, "Daily check-in", `daily:${todayKey()}`);

/** Called when a workout is finished. Returns the total coins granted. */
export async function grantWorkoutRewards(input: { sessionId: string; volumeKg: number; prs: number; streakDays?: number }): Promise<number> {
  let total = 0;
  const volumeLb = input.volumeKg * 2.20462;
  const base = 40 + Math.min(80, Math.round(volumeLb / 125));
  if (await earn(base, "Workout complete", `workout:${input.sessionId}`)) total += base;
  if (input.prs > 0) {
    const n = input.prs * 50;
    if (await earn(n, `${input.prs} personal record${input.prs > 1 ? "s" : ""}`, `workout-pr:${input.sessionId}`)) total += n;
  }
  const bonus = input.streakDays ? STREAK_MILESTONES[input.streakDays] : undefined;
  if (bonus && (await earn(bonus, `${input.streakDays}-day streak`, `streak:${input.streakDays}`))) total += bonus;
  return total;
}

/** Goal completion — once per goal per period. */
export const grantGoalReward = (goalId: string, periodKey: string, label: string) => earn(30, `Goal · ${label}`, `goal:${goalId}:${periodKey}`);

// ── weekly challenges ───────────────────────────────────────────────────────
export interface Challenge {
  id: string;
  title: string;
  detail: string;
  target: number;
  current: number;
  unit: string;
  reward: number;
  tone: "pink" | "cyan" | "lime" | "amber" | "violet";
  done: boolean;
  claimed: boolean;
}

/** Build this week's challenges from real history. `claimed` comes from the grant log. */
export async function computeChallenges(input: { sessions: WorkoutSession[]; musclesThisWeek: number; weeklyTarget: number; metric: boolean }): Promise<Challenge[]> {
  await load();
  const wk = weekKey();
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = input.sessions.filter((s) => Date.parse(s.startedAt) >= monday.getTime());
  const volKg = week.reduce((n, s) => n + (s.totalVolumeKg ?? 0), 0);
  const early = week.filter((s) => new Date(s.startedAt).getHours() < 9).length;
  const volTarget = input.metric ? 54000 : 120000;
  const volCurrent = Math.round(input.metric ? volKg : volKg * 2.20462);
  const target = Math.max(2, input.weeklyTarget || 4);
  const rows: Omit<Challenge, "done" | "claimed">[] = [
    { id: "ch-consistency", title: "Show up", detail: `Complete ${target} workouts this week`, target, current: week.length, unit: "workouts", reward: 180, tone: "pink" },
    { id: "ch-volume", title: "Move weight", detail: `Log ${volTarget.toLocaleString()} ${input.metric ? "kg" : "lb"} of total volume`, target: volTarget, current: volCurrent, unit: input.metric ? "kg" : "lb", reward: 220, tone: "cyan" },
    { id: "ch-early", title: "Early sets", detail: "Train before 9am twice", target: 2, current: early, unit: "sessions", reward: 150, tone: "amber" },
    { id: "ch-explorer", title: "Mix it up", detail: "Train 5 different muscle groups", target: 5, current: input.musclesThisWeek, unit: "groups", reward: 160, tone: "violet" },
  ];
  return rows.map((c) => ({ ...c, current: Math.min(c.target, c.current), done: c.current >= c.target, claimed: Boolean(state.grants[`${c.id}:${wk}`]) }));
}

export const claimChallenge = (c: Challenge) => (c.done && !c.claimed ? earn(c.reward, `Challenge · ${c.title}`, `${c.id}:${weekKey()}`) : Promise.resolve(false));

// ── collector levels (lifetime earned) ──────────────────────────────────────
export const LEVELS = [
  { level: 1, title: "Rookie", at: 0 },
  { level: 2, title: "Regular", at: 400 },
  { level: 3, title: "Committed", at: 1000 },
  { level: 4, title: "Dedicated", at: 2000 },
  { level: 5, title: "Relentless", at: 3600 },
  { level: 6, title: "Elite", at: 6000 },
  { level: 7, title: "Legend", at: 9500 },
  { level: 8, title: "Mythic", at: 15000 },
];

export function levelFor(lifetime: number) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (lifetime >= l.at) current = l;
  const next = LEVELS.find((l) => l.at > current.at) ?? null;
  const span = next ? next.at - current.at : 1;
  return { ...current, next, toNext: next ? next.at - lifetime : 0, pct: next ? Math.min(1, (lifetime - current.at) / span) : 1 };
}
