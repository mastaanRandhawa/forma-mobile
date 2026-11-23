/**
 * Training progression + rewards — read from the server (GET /rewards/state).
 *
 *   • Weekly streak — consecutive weeks on your session target. Rest days never
 *     break it, one missed week per 4 is forgiven, and streak shields cover more.
 *   • Rank — from training alone (sessions + weeks on target, last 52 weeks).
 *   • Coins — granted by the server from what you did; the app never sends an
 *     amount. Quests, shields, pledges and weekly deals all live on the server.
 */
import { useMemo } from "react";
import { api } from "@/api/client";
import { useResource } from "@/api/hooks";
import { usePrefs } from "@/api/settings";
import type { RankInfo, RewardsState, StreakInfo } from "@/api/types";

const EMPTY_STREAK: StreakInfo = { weeks: 0, target: 3, thisWeek: 0, passReady: true };
const EMPTY_RANK: RankInfo = { rank: 1, title: "Rookie", xp: 0, next: { rank: 2, title: "Regular", at: 500 }, toNext: 500, pct: 0 };

/** Full rewards state. The check-in quest swaps out when manual check-ins are off on this device. */
export function useRewards() {
  const checkinsEnabled = usePrefs().recovery.manualCheckins;
  const res = useResource<RewardsState>(`rewards:${checkinsEnabled}`, () => api.rewards.state(checkinsEnabled));
  return Object.assign(res, { checkinsEnabled });
}

/** Streak + rank for the signed-in user. */
export function useTrainingProgress() {
  const r = useRewards();
  return useMemo(
    () => ({ streak: r.data?.streak ?? EMPTY_STREAK, rank: r.data?.rank ?? EMPTY_RANK, shields: r.data?.shields.held ?? 0, loading: r.initialLoading, reload: r.reload }),
    [r.data, r.initialLoading, r.reload],
  );
}
