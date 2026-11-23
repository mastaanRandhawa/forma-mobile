/**
 * Coin economy — ported from the website's lib/rewards.ts + lib/wallet.ts.
 *
 * The backend only awards coins for achievements; everything else (recovery
 * check-ins, finished workouts, PRs, weekly-streak milestones, goals, weekly
 * quests) is credited by the client through POST /store/wallet/earn — the
 * same contract the website uses. Every grant carries an idempotency key that
 * is remembered on-device so a reward is never paid twice from this phone.
 *
 * Rank (who you are) lives in ./progression and comes from training alone;
 * coins here are only what you spend in the store.
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
// Coins pay for training and recovery, never for just opening the app.
/** Weekly-streak milestones, paid the week the streak reaches them (re-earnable after a reset). */
const WEEK_STREAK_MILESTONES: Record<number, number> = { 2: 60, 4: 120, 8: 220, 12: 320, 26: 450, 52: 600 };

/** Recovery check-in — once per day, so rest days earn too. */
export const grantCheckinReward = () => earn(15, "Recovery check-in", `checkin:${todayKey()}`);

/** Called when a workout is finished. Returns the total coins granted. */
export async function grantWorkoutRewards(input: { sessionId: string; volumeKg: number; prs: number; streakWeeks?: number; targetJustHit?: boolean }): Promise<number> {
  let total = 0;
  const volumeLb = input.volumeKg * 2.20462;
  const base = 40 + Math.min(80, Math.round(volumeLb / 125));
  if (await earn(base, "Workout complete", `workout:${input.sessionId}`)) total += base;
  if (input.prs > 0) {
    const n = input.prs * 50;
    if (await earn(n, `${input.prs} personal record${input.prs > 1 ? "s" : ""}`, `workout-pr:${input.sessionId}`)) total += n;
  }
  const bonus = input.targetJustHit && input.streakWeeks ? WEEK_STREAK_MILESTONES[input.streakWeeks] : undefined;
  if (bonus && (await earn(bonus, `${input.streakWeeks}-week streak`, `wstreak:${input.streakWeeks}:${weekKey()}`))) total += bonus;
  return total;
}

/** Goal completion — once per goal per period. */
export const grantGoalReward = (goalId: string, periodKey: string, label: string) => earn(30, `Goal · ${label}`, `goal:${goalId}:${periodKey}`);

// ── weekly quests ───────────────────────────────────────────────────────────
export interface Quest {
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

/**
 * This week's three quests, built from real history. `claimed` comes from the
 * grant log. Ids are stable across versions so earlier claims still count.
 */
export async function computeQuests(input: { sessions: WorkoutSession[]; musclesThisWeek: number; weeklyTarget: number; checkinDays: number; checkinsEnabled: boolean }): Promise<Quest[]> {
  await load();
  const wk = weekKey();
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = input.sessions.filter((s) => Date.parse(s.startedAt) >= monday.getTime());
  const target = Math.max(1, input.weeklyTarget || 3);
  const rows: Omit<Quest, "done" | "claimed">[] = [
    { id: "ch-consistency", title: "Show up", detail: `Finish ${target} workout${target > 1 ? "s" : ""} this week`, target, current: week.length, unit: "workouts", reward: 180, tone: "pink" },
    input.checkinsEnabled
      ? { id: "ch-checkin", title: "Listen in", detail: "Do a recovery check-in on 3 days", target: 3, current: input.checkinDays, unit: "days", reward: 120, tone: "lime" }
      : { id: "ch-early", title: "Early sets", detail: "Train before 9am twice", target: 2, current: week.filter((s) => new Date(s.startedAt).getHours() < 9).length, unit: "sessions", reward: 150, tone: "amber" },
    { id: "ch-explorer", title: "Mix it up", detail: "Train 5 different muscle groups", target: 5, current: input.musclesThisWeek, unit: "groups", reward: 160, tone: "violet" },
  ];
  return rows.map((c) => ({ ...c, current: Math.min(c.target, c.current), done: c.current >= c.target, claimed: Boolean(state.grants[`${c.id}:${wk}`]) }));
}

export const claimQuest = (q: Quest) => (q.done && !q.claimed ? earn(q.reward, `Quest · ${q.title}`, `${q.id}:${weekKey()}`) : Promise.resolve(false));
