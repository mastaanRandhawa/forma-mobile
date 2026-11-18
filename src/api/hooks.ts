/**
 * React data hooks over the API client.
 *
 * Each hook returns `{ data, error, loading, refetch, mutate }` (ported from the web app).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "./client";
import type * as T from "./types";

export const API_ENABLED = true;

export interface Resource<D> {
  data: D | null;
  error: Error | null;
  loading: boolean;
  /** true only on the very first load (not on refetch / background revalidation) */
  initialLoading: boolean;
  refetch: () => void;
  /** write a known-fresh value straight into state + cache (e.g. the object a
   *  mutation endpoint returns) so no follow-up GET is needed */
  mutate: (data: D) => void;
}

/**
 * Process-wide stale-while-revalidate cache for `useResource`, keyed by the
 * resource `key`. Navigating away from and back to a screen re-mounts its hooks;
 * seeding `data` from here means the screen paints its last-known content
 * immediately instead of flashing a skeleton and re-fetching every time.
 *
 * A cached entry newer than `STALE_MS` is served as-is with no network call. An
 * older entry is still shown instantly, then refreshed in the background.
 * `refetch()` and `invalidateResource()` force a foreground reload.
 */
const STALE_MS = 30_000;
interface CacheEntry<D> {
  data: D;
  at: number;
}
const resourceCache = new Map<string, CacheEntry<unknown>>();

/** Drop cached resources so their next read re-fetches. Pass a prefix like
 *  `"session-"` to clear a family, or nothing to clear everything (e.g. on
 *  logout / after a mutation that invalidates many screens). */
export function invalidateResource(prefix?: string): void {
  if (!prefix) {
    resourceCache.clear();
    return;
  }
  for (const k of resourceCache.keys()) if (k.startsWith(prefix)) resourceCache.delete(k);
}

/** Run `fetcher` on mount and whenever `key` changes; expose load state. */
export function useResource<D>(key: string, fetcher: () => Promise<D>): Resource<D> {
  const cached = resourceCache.get(key) as CacheEntry<D> | undefined;
  const [data, setData] = useState<D | null>(cached ? cached.data : null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(!cached);
  const seenRef = useRef(!!cached);
  const keyRef = useRef(key);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // `key` changed between renders (e.g. a range switch) — re-seed synchronously
  // from that key's cache so we never render another key's data or a stale null.
  if (keyRef.current !== key) {
    keyRef.current = key;
    const next = resourceCache.get(key) as CacheEntry<D> | undefined;
    setData(next ? next.data : null);
    setLoading(!next);
    setError(null);
    seenRef.current = !!next;
  }

  const run = useCallback((background: boolean) => {
    const k = keyRef.current;
    let cancelled = false;
    if (!background) setLoading(true);
    setError(null);
    Promise.resolve()
      .then(fetcherRef.current)
      .then((d) => {
        if (cancelled) return;
        resourceCache.set(k, { data: d, at: Date.now() });
        setData(d);
        seenRef.current = true;
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled && !background) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const entry = resourceCache.get(key) as CacheEntry<D> | undefined;
    // Fresh cache hit — nothing to do, the seeded state is already correct.
    if (entry && Date.now() - entry.at < STALE_MS) return;
    // Stale hit → revalidate quietly; miss → foreground load with a skeleton.
    return run(!!entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const mutate = useCallback((d: D) => {
    resourceCache.set(keyRef.current, { data: d, at: Date.now() });
    seenRef.current = true;
    setData(d);
    setError(null);
  }, []);

  return {
    data,
    error,
    loading,
    initialLoading: loading && !seenRef.current,
    refetch: () => run(false),
    mutate,
  };
}

/** Imperative call wrapper — for buttons/forms. `{ run, pending, error }`. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return { run, pending, error };
}

/** Human-readable message for an error surfaced by a hook. */
export function errorMessage(e: Error | null): string {
  if (!e) return "";
  if (e instanceof ApiRequestError) {
    if (e.status === 401) return "Your session expired. Sign in again.";
    if (e.status === 0 || e.message.includes("fetch")) return "Can't reach the server.";
    return e.message;
  }
  if (e.message === "Failed to fetch") return "Can't reach the server.";
  return e.message || "Something went wrong.";
}

// ── resource hooks ──────────────────────────────────────────────────────────

export const useDashboard = () => useResource<T.Dashboard>("dashboard", () => api.dashboard());
export const useGoals = () => useResource<T.GoalWithProgress[]>("goals", () => api.goals.list());
export const useWallet = () => useResource<T.WalletSummary>("wallet", () => api.store.wallet());
export const useStoreItems = () => useResource<T.StoreItem[]>("store-items", () => api.store.items());
export const useTrainer = () => useResource<T.Trainer>("trainer", () => api.trainer.get());
export const useChatHistory = () => useResource<T.ChatMessage[]>("chat", () => api.chat.history());
export const useSuggestedPrompts = () => useResource<string[]>("chat-prompts", () => api.chat.suggestedPrompts());
export const useMuscleMap = (range: T.MuscleMap["range"] = "week") =>
  useResource<T.MuscleMap>(`muscle-map:${range}`, () => api.body.muscleMap(range));
export const useMuscleBalance = () => useResource<T.MuscleBalance>("muscle-balance", () => api.body.balance());
export const useAchievements = () => useResource<T.AchievementProgress[]>("achievements", () => api.achievements.list());
export const useProgressOverview = () => useResource<T.ProgressOverview>("progress-overview", () => api.progress.overview());
export const useReadiness = () => useResource<T.ReadinessBreakdown>("readiness", () => api.progress.readiness());
export const useNotifications = () => useResource<T.NotificationList>("notifications", () => api.notifications.list());

// ── workout lifecycle ───────────────────────────────────────────────────────
export const usePlannedWorkouts = () =>
  useResource<T.Workout[]>("planned-workouts", () => api.workouts.list({ template: "false" }));
export const useWorkoutTemplates = () =>
  useResource<T.Workout[]>("workout-templates", () => api.workouts.list({ template: "true" }));
export const useSessionHistory = () =>
  useResource<T.WorkoutSession[]>("session-history", () => api.sessions.list({ status: "completed", take: 40 }));
export const useConsistency = (weeks = 13) =>
  useResource<T.ConsistencyReport | null>(`consistency:${weeks}`, () => api.progress.consistency(weeks));
export const useNutritionDay = (date?: string) =>
  useResource<T.NutritionDay>(`nutrition:${date ?? "today"}`, () => api.progress.nutrition(date));
export const useInsights = () => useResource<T.CoachingInsight[]>("insights", () => api.trainer.insights());
