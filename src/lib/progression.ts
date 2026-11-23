/**
 * Training progression — the two things the app tracks about you:
 *
 *   • Weekly streak — consecutive weeks where you hit your session target.
 *     Rest days never break it, and one missed week per 4 is forgiven
 *     (a "free pass"), because one miss doesn't break a habit but a run of
 *     misses does.
 *   • Rank — earned only from training (sessions + weeks on target), never
 *     from opening the app or spending coins. Coins are just for the store.
 *
 * Both come from the per-week session counts in GET /progress/consistency,
 * so they're computed over that window (we ask for the last 52 weeks).
 */
import { useMemo } from "react";
import { useConsistency } from "@/api/hooks";
import type { ConsistencyReport } from "@/api/types";
import { useAuth } from "@/auth/auth-provider";

export const HISTORY_WEEKS = 52;
/** At most one forgiven miss in any run of this many weeks. */
const PASS_WINDOW = 4;
export const XP_PER_SESSION = 100;
export const XP_PER_TARGET_WEEK = 150;

export const RANKS = [
  { rank: 1, title: "Rookie", at: 0 },
  { rank: 2, title: "Regular", at: 500 },
  { rank: 3, title: "Committed", at: 1500 },
  { rank: 4, title: "Dedicated", at: 3000 },
  { rank: 5, title: "Relentless", at: 5000 },
  { rank: 6, title: "Elite", at: 8000 },
  { rank: 7, title: "Legend", at: 12000 },
  { rank: 8, title: "Mythic", at: 17000 },
] as const;

export type WeeklyStreak = {
  /** consecutive weeks on target (this week counts once it's hit) */
  weeks: number;
  target: number;
  thisWeek: number;
  /** a miss this week would be forgiven */
  passReady: boolean;
};

export type Rank = {
  rank: number;
  title: string;
  xp: number;
  next: { rank: number; title: string; at: number } | null;
  toNext: number;
  pct: number;
};

function mondayOf(d = new Date()) {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/** Oldest → newest, with this week split out (zero if the report has no row for it yet). */
function splitWeeks(report: ConsistencyReport) {
  const rows = report.weeks.map((w, i) => ({ t: Date.parse(w.week), i, sessions: w.sessions }));
  if (rows.every((r) => !Number.isNaN(r.t))) rows.sort((a, b) => a.t - b.t);
  const monday = mondayOf().getTime();
  const last = rows[rows.length - 1];
  // rows we can't date are assumed to end with the current week, as the API returns them
  const lastIsCurrent = last ? Number.isNaN(last.t) || last.t >= monday - 864e5 : false;
  return {
    past: (lastIsCurrent ? rows.slice(0, -1) : rows).map((r) => r.sessions),
    thisWeek: lastIsCurrent ? last.sessions : 0,
  };
}

export const targetFor = (report: ConsistencyReport | null | undefined, userTarget?: number | null) =>
  Math.max(1, userTarget || report?.target || 3);

export function weeklyStreak(report: ConsistencyReport | null | undefined, userTarget?: number | null): WeeklyStreak {
  const target = targetFor(report, userTarget);
  if (!report?.weeks?.length) return { weeks: 0, target, thisWeek: 0, passReady: true };
  const { past, thisWeek } = splitWeeks(report);
  const firstActive = past.findIndex((n) => n > 0);
  let weeks = 0;
  let passAt: number | null = null; // index (0 = last week) of the most recent forgiven miss
  for (let i = 0; i < past.length; i++) {
    const idx = past.length - 1 - i;
    if (firstActive < 0 || idx < firstActive) break; // before you started training
    if (past[idx] >= target) weeks++;
    else if (passAt === null || i - passAt >= PASS_WINDOW) passAt = i;
    else break;
  }
  if (weeks === 0) passAt = null; // a pass with nothing to protect isn't spent
  if (thisWeek >= target) weeks++;
  return { weeks, target, thisWeek, passReady: passAt === null || passAt >= PASS_WINDOW - 1 };
}

export function rankFor(report: ConsistencyReport | null | undefined, userTarget?: number | null): Rank {
  const target = targetFor(report, userTarget);
  const weeks = report?.weeks ?? [];
  const xp = weeks.reduce((n, w) => n + w.sessions * XP_PER_SESSION + (w.sessions >= target ? XP_PER_TARGET_WEEK : 0), 0);
  let current: (typeof RANKS)[number] = RANKS[0];
  for (const r of RANKS) if (xp >= r.at) current = r;
  const next = RANKS.find((r) => r.at > current.at) ?? null;
  return {
    rank: current.rank,
    title: current.title,
    xp,
    next,
    toNext: next ? next.at - xp : 0,
    pct: next ? Math.min(1, (xp - current.at) / (next.at - current.at)) : 1,
  };
}

/** Streak + rank for the signed-in user, from one consistency query. */
export function useTrainingProgress() {
  const { user } = useAuth();
  const report = useConsistency(HISTORY_WEEKS);
  const target = user?.trainingFrequencyTarget;
  return useMemo(
    () => ({ streak: weeklyStreak(report.data, target), rank: rankFor(report.data, target), loading: report.initialLoading, reload: report.reload }),
    [report.data, report.initialLoading, report.reload, target],
  );
}
