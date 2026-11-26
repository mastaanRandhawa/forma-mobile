/**
 * Active workout — the focused, one-set-at-a-time logger (website:
 * pages/ActiveWorkout.tsx), adapted for one-handed use on a phone.
 *
 * The server session owns completed sets; src/lib/active-session.ts owns the
 * flow (focus cursor, skips, deferrals, planned set slots, pause + rest timer)
 * and persists it per session so nothing is lost on navigation or app kill.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, AppState, Image, Pressable, ScrollView, Vibration, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Reanimated, { Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { api } from "@/api/client";
import { errorMessage, invalidateResource } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import type { Exercise, ExercisePerformance, ExerciseHistory, SwapSuggestion, WorkoutSession } from "@/api/types";
import {
  activeRow,
  clearActiveUI,
  elapsedSec,
  epley1RM,
  exerciseComplete,
  getActiveUI,
  loadActiveUI,
  nextFocus,
  phaseOf,
  progressOf,
  setKey,
  setRows,
  sortedPerfs,
  supersetLetter,
  supersetPeers,
  updateActiveUI,
  useActiveUI,
  workingRows,
  type ActiveUI,
  type SetRow,
} from "@/lib/active-session";
import { trainerCue } from "@/lib/cues";
import { plateCombo, plateLabel } from "@/lib/plates";
import { cancelRestAlert, scheduleRestAlert } from "@/lib/reminders";
import { setDevicePrefs, useDevicePrefs } from "@/lib/device-prefs";
import { fmtClock, fmtDuration, fromKg, repRange, saveSessionAsTemplate, startRepeat, toKg, unitLabel, type Units } from "@/lib/workouts";
import { useEquippedItem, useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { repdbEntryFor, repdbImage } from "@/lib/repdb";
import { ExerciseDetailSheet, ExercisePicker, ExerciseThumb } from "@/components/exercise";
import { Atmosphere, Screen } from "@/components/ui/screen";
import { Button, Chip } from "@/components/ui/controls";
import { EmptyState, PageSkeleton, SettingRow, Sheet, Stepper } from "@/components/ui/extra";
import { KaiOrb } from "@/components/ui/kai-orb";
import { PressScale } from "@/components/ui/pressable";
import { toast } from "@/components/ui/toast";
import { Label, Num, Text } from "@/components/ui/text";
import { EASE_LUXURY } from "@/lib/ease";
import { motion } from "@/lib/motion";

const COMPOUND_REST = 120;
const ISOLATION_REST = 75;
const DEFAULT_REST = 90;
const adaptiveRest = (mechanic: string | null | undefined, lastRpe: number | null | undefined) =>
  ((lastRpe ?? 0) >= 9 ? 30 : 0) + (mechanic === "compound" ? COMPOUND_REST : mechanic === "isolation" ? ISOLATION_REST : DEFAULT_REST);

type Summary = {
  session: WorkoutSession;
  durationSec: number;
  volumeKg: number;
  sets: number;
  prs: string[];
  coins: number;
  /** what the server paid, line by line */
  coinLines: { label: string; amount: number }[];
  /** rank XP this session earned, and the weekly streak after it */
  xp: number;
  streakWeeks: number;
  targetHit: boolean;
  rank: string | null;
  muscles: string[];
  skipped: number;
  vsLast: { volumeKg: number; durationSec: number } | null;
  protein: { eaten: number; target: number } | null;
};

export default function ActiveWorkout() {
  useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const look = useEquippedItem("avatar")?.id;
  const units: Units = user?.unitPreference ?? "imperial";
  const u = unitLabel(units);
  const step = units === "metric" ? 2.5 : 5;

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const ui = useActiveUI(session?.id);
  const [now, setNow] = useState(Date.now());
  const [history, setHistory] = useState<Record<string, ExerciseHistory | null>>({});
  const [milestone, setMilestone] = useState<{ kind: "pr" | "exercise"; title: string; detail?: string } | null>(null);
  const [sheet, setSheet] = useState<null | "overview" | "end" | "add" | "swap" | "howto" | "swapLibrary" | "menu">(null);
  const [swapFor, setSwapFor] = useState<ExercisePerformance | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [savedTpl, setSavedTpl] = useState(false);
  const [setOpts, setSetOpts] = useState(false);
  // timers stay out of sight unless asked for (⋯ menu); rest shows as a bar
  const dp = useDevicePrefs();
  const priorRef = useRef<WorkoutSession[]>([]);

  const id = session?.id ?? null;
  const patchUI = useCallback((fn: (u: ActiveUI) => ActiveUI) => id && updateActiveUI(id, fn), [id]);

  // ── load the in-progress session + plan targets ──────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await api.sessions.list({ status: "in_progress", take: 1 });
      if (!list[0]) {
        setSession(null);
        return;
      }
      const s = await api.sessions.get(list[0].id);
      const stored = await loadActiveUI(s.id);
      // first open: derive planned set slots + targets from the workout plan
      const missing = s.performances.filter((p) => stored.planned[p.id] == null);
      if (missing.length) {
        const plan = s.workoutId ? await api.workouts.get(s.workoutId).catch(() => null) : null;
        updateActiveUI(s.id, (cur) => {
          const planned = { ...cur.planned };
          const targets = { ...cur.targets };
          const drafts = { ...cur.drafts };
          for (const p of missing) {
            const we = plan?.exercises.find((e) => e.order === p.order && e.exerciseId === p.exerciseId) ?? plan?.exercises.find((e) => e.exerciseId === p.exerciseId);
            const n = Math.max(1, we?.targetSets ?? 3, p.sets.length);
            planned[p.id] = n;
            targets[p.id] = we ? `${we.targetSets} × ${repRange(we.targetRepsMin, we.targetRepsMax)}` : "3 × 8–12";
            const w = p.prescribedWeightKg ?? we?.targetWeightKg ?? null;
            const r = p.prescribedReps ?? we?.targetRepsMax ?? null;
            for (let k = 1; k <= n; k++) if (!p.sets.find((x) => x.setNumber === k)) drafts[setKey(p.id, k)] = { weightKg: w, reps: r, rpe: null };
          }
          return { ...cur, planned, targets, drafts };
        });
      }
      const cur = getActiveUI(s.id);
      if (!cur.cursor || !s.performances.some((p) => p.id === cur.cursor)) updateActiveUI(s.id, (c) => ({ ...c, cursor: nextFocus(s, c) }));
      setSession(s);
      api.sessions.list({ status: "completed", take: 40 }).then((h) => (priorRef.current = h)).catch(() => {});
    } catch (e) {
      setLoadError(errorMessage(e as Error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // tick: 250ms while resting (smooth ring), 1s otherwise
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ui.restEndsAt ? 250 : 1000);
    return () => clearInterval(t);
  }, [ui.restEndsAt]);

  // returning from background → re-sync clock immediately
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && setNow(Date.now()));
    return () => sub.remove();
  }, []);

  const perfs = useMemo(() => (session ? sortedPerfs(session) : []), [session]);
  const current = perfs.find((p) => p.id === ui.cursor) ?? null;
  const restLeft = ui.restEndsAt ? Math.max(0, Math.ceil((ui.restEndsAt - now) / 1000)) : 0;

  // rest finished
  useEffect(() => {
    if (ui.restEndsAt && restLeft <= 0) {
      patchUI((c) => ({ ...c, restEndsAt: null }));
      Vibration.vibrate([0, 180, 90, 180]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [ui.restEndsAt, restLeft, patchUI]);

  // milestone auto-hide
  useEffect(() => {
    if (!milestone) return;
    const t = setTimeout(() => setMilestone(null), 3400);
    return () => clearTimeout(t);
  }, [milestone]);

  // previous-performance lookup for the exercise in focus
  useEffect(() => {
    const slug = current?.exercise.slug;
    if (!slug || slug in history) return;
    setHistory((h) => ({ ...h, [slug]: null }));
    api.library.exerciseHistory(slug, 3).then((r) => setHistory((h) => ({ ...h, [slug]: r }))).catch(() => {});
  }, [current?.exercise.slug, history]);

  // ── mutations ────────────────────────────────────────────────────────────
  const replacePerf = (perf: ExercisePerformance) => setSession((s) => (s ? { ...s, performances: s.performances.map((p) => (p.id === perf.id ? perf : p)) } : s));

  const patchDraft = (perf: ExercisePerformance, row: SetRow, p: Partial<{ weightKg: number | null; reps: number | null; rpe: number | null; warmup: boolean }>) =>
    patchUI((c) => ({ ...c, drafts: { ...c.drafts, [setKey(perf.id, row.n)]: { weightKg: row.weightKg, reps: row.reps, rpe: row.rpe, warmup: row.warmup, ...p } } }));

  const startRest = (sec: number) => {
    patchUI((c) => ({ ...c, restEndsAt: Date.now() + sec * 1000, restTotal: sec }));
    void scheduleRestAlert(sec);
  };
  const stopRest = () => {
    patchUI((c) => ({ ...c, restEndsAt: null }));
    cancelRestAlert();
  };
  const adjustRest = (delta: number) => {
    const left = Math.max(1, restLeft + delta);
    patchUI((c) => ({ ...c, restEndsAt: Date.now() + left * 1000, restTotal: Math.max(c.restTotal, left) }));
    void scheduleRestAlert(left);
  };

  const togglePause = () => {
    Haptics.selectionAsync().catch(() => {});
    patchUI((c) =>
      c.paused
        ? { ...c, paused: false, pausedAt: null, pausedMs: c.pausedMs + (c.pausedAt ? Date.now() - c.pausedAt : 0) }
        : { ...c, paused: true, pausedAt: Date.now(), restEndsAt: null },
    );
    cancelRestAlert();
  };

  const focus = (perfId: string) => {
    patchUI((c) => ({ ...c, cursor: perfId }));
    setSheet(null);
  };

  /** Write one set to the server. Completed sets only — planned slots stay on-device. */
  const saveSet = async (perf: ExercisePerformance, row: SetRow, completed: boolean) => {
    if (!session) return null;
    if (!completed) {
      // un-complete: the API can't clear completedAt, so drop the row and keep the values as a draft
      await api.sessions.deleteSet(session.id, perf.id, row.n);
      patchUI((c) => ({ ...c, drafts: { ...c.drafts, [setKey(perf.id, row.n)]: { weightKg: row.weightKg, reps: row.reps, rpe: row.rpe, warmup: row.warmup } } }));
      const next = { ...perf, sets: perf.sets.filter((s) => s.setNumber !== row.n) };
      replacePerf(next);
      return next;
    }
    const saved = await api.sessions.logSet(session.id, perf.id, row.n, { weightKg: row.weightKg, reps: row.reps, rpe: row.rpe, isWarmup: row.warmup, completed: true });
    const next = { ...perf, sets: [...perf.sets.filter((s) => s.setNumber !== row.n), saved].sort((a, b) => a.setNumber - b.setNumber) };
    replacePerf(next);
    return next;
  };

  const toggleRow = async (perf: ExercisePerformance, row: SetRow) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await saveSet(perf, row, !row.done);
    } catch (e) {
      toast.error(errorMessage(e as Error));
    }
  };

  const deleteRow = async (perf: ExercisePerformance, row: SetRow) => {
    if (!session) return;
    const rows = setRows(perf, ui);
    if (rows.length <= 1) return toast.info("An exercise needs at least one set. Skip it instead.");
    if (rows.some((r) => r.n > row.n && r.saved)) return toast.info("Undo the later sets first, then delete this one.");
    try {
      if (row.saved) await api.sessions.deleteSet(session.id, perf.id, row.n);
      replacePerf({ ...perf, sets: perf.sets.filter((s) => s.setNumber !== row.n) });
      patchUI((c) => {
        const drafts = { ...c.drafts };
        for (let n = row.n; n < rows.length; n++) {
          const nextD = drafts[setKey(perf.id, n + 1)];
          if (nextD) drafts[setKey(perf.id, n)] = nextD;
          else delete drafts[setKey(perf.id, n)];
        }
        delete drafts[setKey(perf.id, rows.length)];
        return { ...c, drafts, planned: { ...c.planned, [perf.id]: rows.length - 1 } };
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (e) {
      toast.error(errorMessage(e as Error));
    }
  };

  const addSet = (perf: ExercisePerformance, warmup: boolean) => {
    const rows = setRows(perf, ui);
    const last = [...rows].reverse().find((r) => !r.warmup) ?? rows[rows.length - 1];
    const n = rows.length + 1;
    const w = last?.weightKg ?? null;
    patchUI((c) => ({
      ...c,
      planned: { ...c.planned, [perf.id]: n },
      drafts: { ...c.drafts, [setKey(perf.id, n)]: { weightKg: warmup && w != null ? Math.round(w * 0.5 * 2) / 2 : w, reps: warmup ? 10 : last?.reps ?? null, rpe: null, warmup } },
    }));
    Haptics.selectionAsync().catch(() => {});
  };

  const findPR = (perf: ExercisePerformance): string | null => {
    const h = history[perf.exercise.slug];
    const done = perf.sets.filter((s) => s.completedAt && !s.isWarmup && s.weightKg != null && s.reps != null);
    if (!done.length) return null;
    const bestW = Math.max(...done.map((s) => s.weightKg!));
    const bestE = Math.max(...done.map((s) => epley1RM(s.weightKg!, s.reps!)));
    const prev = h?.personalRecords ?? [];
    const prevW = prev.find((r) => r.recordType === "max_weight")?.value ?? 0;
    const prevE = prev.find((r) => r.recordType === "max_1rm_estimate")?.value ?? 0;
    if (!h || (!h.history.length && !prev.length)) return null; // first time isn't a "record"
    if (bestW > prevW && prevW > 0) return `${perf.exercise.name} — heaviest set ${fromKg(bestW, units)} ${u}`;
    if (bestE > prevE && prevE > 0) return `${perf.exercise.name} — est. 1RM ${fromKg(bestE, units)} ${u}`;
    return null;
  };

  /** Complete the set in focus and route to the next thing (rest, superset peer, next exercise). */
  const completeActive = async () => {
    if (!session || !current || ui.paused || busy) return;
    const row = activeRow(current, ui);
    if (!row) return;
    setBusy("complete");
    try {
      const fresh = await saveSet(current, row, true);
      if (!fresh) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      // carry the values forward into the next empty working set
      const nextEmpty = setRows(fresh, getActiveUI(session.id)).find((r) => !r.done && r.n > row.n && !r.warmup && r.weightKg == null && r.reps == null);
      if (nextEmpty && !row.warmup) patchUI((c) => ({ ...c, drafts: { ...c.drafts, [setKey(fresh.id, nextEmpty.n)]: { weightKg: row.weightKg, reps: row.reps, rpe: null } } }));
      const nextSession = { ...session, performances: session.performances.map((p) => (p.id === fresh.id ? fresh : p)) };
      const doneNow = exerciseComplete(fresh, ui);
      if (doneNow && !row.warmup) {
        const pr = findPR(fresh);
        if (pr) {
          setMilestone({ kind: "pr", title: "New personal record", detail: pr });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else {
          setMilestone({ kind: "exercise", title: `${fresh.exercise.name} complete`, detail: `${workingRows(fresh, ui).filter((r) => r.done).length} sets` });
        }
      }
      if (row.warmup) return; // no rest/advance after a warm-up

      const lastRpe = row.rpe;
      // superset routing: interleave peers, rest only after the round
      const peers = supersetPeers(nextSession, fresh).filter((p) => !ui.skipped.includes(p.id));
      if (peers.length > 1) {
        const idx = peers.findIndex((p) => p.id === fresh.id);
        for (let k = 1; k <= peers.length; k++) {
          const cand = peers[(idx + k) % peers.length];
          if (activeRow(cand, ui) && !exerciseComplete(cand, ui)) {
            patchUI((c) => ({ ...c, cursor: cand.id }));
            if ((idx + k) % peers.length <= idx) startRest(adaptiveRest(fresh.exercise.mechanic, lastRpe));
            return;
          }
        }
      }

      if (doneNow) {
        const nextId = nextFocus(nextSession, getActiveUI(session.id), fresh.id);
        if (!nextId) {
          setTimeout(() => setSheet("end"), 900);
          return;
        }
        patchUI((c) => ({ ...c, cursor: nextId }));
        startRest(DEFAULT_REST);
      } else {
        startRest(adaptiveRest(fresh.exercise.mechanic, lastRpe));
      }
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(null);
    }
  };

  // ── add / swap / skip / defer ────────────────────────────────────────────
  const addExercise = async (ex: Exercise) => {
    if (!session) return;
    setSheet(null);
    try {
      const order = Math.max(-1, ...session.performances.map((p) => p.order)) + 1;
      const perf = await api.sessions.addPerformance(session.id, ex.id, order);
      setSession({ ...session, performances: [...session.performances, perf] });
      patchUI((c) => ({
        ...c,
        cursor: c.cursor && session.performances.some((p) => p.id === c.cursor && !exerciseComplete(p, c)) ? c.cursor : perf.id,
        planned: { ...c.planned, [perf.id]: 3 },
        targets: { ...c.targets, [perf.id]: "3 × 8–12" },
      }));
      toast.success(`${ex.name} added`);
    } catch (e) {
      toast.error(errorMessage(e as Error));
    }
  };

  const swapTo = async (perf: ExercisePerformance, exerciseId: string, name: string) => {
    if (!session) return;
    setSheet(null);
    try {
      const next = await api.sessions.addPerformance(session.id, exerciseId, perf.order);
      setSession({ ...session, performances: [...session.performances, next] });
      const remaining = Math.max(1, workingRows(perf, ui).filter((r) => !r.done).length);
      patchUI((c) => ({
        ...c,
        skipped: [...c.skipped.filter((x) => x !== perf.id), perf.id],
        cursor: next.id,
        swappedFrom: { ...c.swappedFrom, [next.id]: perf.exercise.name },
        planned: { ...c.planned, [next.id]: remaining },
        targets: { ...c.targets, [next.id]: c.targets[perf.id] ?? "3 × 8–12" },
      }));
    } catch (e) {
      toast.error(errorMessage(e as Error));
    }
  };

  /** Ask before anything that changes or discards the session. */
  const ask = (title: string, message: string, label: string, run: () => void, destructive = false) =>
    Alert.alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: label, style: destructive ? "destructive" : "default", onPress: run }]);
  /** Menu rows close the menu first, then act — two modals can't swap in one frame. */
  const fromMenu = (fn: () => void) => () => {
    setSheet(null);
    setTimeout(fn, 280);
  };

  const defer = (perf: ExercisePerformance, reason: string) => {
    if (!session) return;
    patchUI((c) => {
      const next = { ...c, deferred: { ...c.deferred, [perf.id]: reason } };
      return { ...next, cursor: nextFocus(session, next, perf.id) ?? perf.id };
    });
    setSheet(null);
  };
  const resume = (perf: ExercisePerformance) => {
    patchUI((c) => {
      const deferred = { ...c.deferred };
      delete deferred[perf.id];
      return { ...c, deferred, cursor: perf.id };
    });
    setSheet(null);
  };
  const setSkip = (perf: ExercisePerformance, skip: boolean) => {
    if (!session) return;
    patchUI((c) => {
      const next = { ...c, skipped: skip ? [...c.skipped, perf.id] : c.skipped.filter((x) => x !== perf.id) };
      return { ...next, cursor: skip && c.cursor === perf.id ? nextFocus(session, next, perf.id) : c.cursor ?? perf.id };
    });
  };

  // ── finish / leave ───────────────────────────────────────────────────────
  const finish = async () => {
    if (!session || busy === "finish") return;
    setBusy("finish");
    const s = session;
    const flow = getActiveUI(s.id);
    const durationSec = elapsedSec(s, flow);
    try {
      // the server totals every row with weight × reps, so drop any unfinished rows first
      for (const p of s.performances) for (const set of p.sets) if (!set.completedAt) await api.sessions.deleteSet(s.id, p.id, set.setNumber).catch(() => {});
      const done = await api.sessions.finish(s.id, { durationSeconds: durationSec });
      cancelRestAlert();
      const prs = (done.personalRecords ?? []).map((p) => `${p.exercise?.name ?? "Lift"} — ${p.recordType.replace(/_/g, " ")}`);
      // coins, XP and the weekly streak are decided by the server and come back on the finish response
      const rewards = done.rewards ?? null;
      const muscles = [...new Set((done.muscleActivations ?? []).filter((m) => m.role === "primary").map((m) => m.muscleGroup?.name).filter(Boolean) as string[])].slice(0, 6);
      const last = priorRef.current.find((x) => x.name === s.name && x.id !== s.id);
      let protein: Summary["protein"] = null;
      const day = await api.food.day().catch(() => null);
      if (day?.goal?.proteinGrams && day.totals.protein < day.goal.proteinGrams * 0.85) protein = { eaten: Math.round(day.totals.protein), target: day.goal.proteinGrams };
      clearActiveUI(s.id);
      invalidateResource();
      setSummary({
        session: done,
        durationSec: done.durationSeconds || durationSec,
        volumeKg: done.totalVolumeKg,
        sets: done.performances.reduce((n, p) => n + p.sets.filter((x) => x.completedAt && !x.isWarmup).length, 0),
        prs,
        coins: rewards?.coins ?? 0,
        coinLines: rewards?.lines ?? [],
        xp: rewards?.xp ?? 0,
        streakWeeks: rewards?.streak.weeks ?? 0,
        targetHit: rewards?.targetHit ?? false,
        rank: rewards ? `Rank ${rewards.rank.rank} · ${rewards.rank.title}` : null,
        muscles: muscles.length ? muscles : [...new Set(done.performances.filter((p) => p.sets.some((x) => x.completedAt)).map((p) => p.exercise.bodyPart ?? p.exercise.category).filter(Boolean) as string[])].slice(0, 6),
        // replaced exercises are recorded as skipped + a swappedFrom entry; only count real skips
        skipped: Math.max(0, flow.skipped.length - Object.keys(flow.swappedFrom).length),
        vsLast: last ? { volumeKg: done.totalVolumeKg - last.totalVolumeKg, durationSec: (done.durationSeconds || durationSec) - last.durationSeconds } : null,
        protein,
      });
      setSheet(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!session) return;
    setBusy("discard");
    try {
      await api.sessions.abandon(session.id);
      clearActiveUI(session.id);
      cancelRestAlert();
      invalidateResource();
      setSheet(null);
      router.replace("/workouts");
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(null);
    }
  };

  const pauseAndExit = () => {
    if (!ui.paused) togglePause();
    setSheet(null);
    invalidateResource("active-session");
    if (router.canGoBack()) router.back();
    else router.replace("/workouts");
  };

  // ── render ───────────────────────────────────────────────────────────────
  if (loading && !session && !summary) return <Screen><PageSkeleton /></Screen>;
  if (summary) return <SummaryView summary={summary} units={units} look={look} savedTpl={savedTpl} onSaveTpl={async () => { try { await saveSessionAsTemplate(summary.session); setSavedTpl(true); toast.success("Saved to your templates"); } catch (e) { toast.error(errorMessage(e as Error)); } }} onRepeat={async () => { try { await startRepeat(summary.session); setSummary(null); setSavedTpl(false); invalidateResource("active-session"); await load(); } catch (e) { toast.error(errorMessage(e as Error)); } }} onDone={() => router.replace("/workouts")} onProgress={() => router.replace("/progress")} />;
  if (loadError && !session)
    return (
      <Screen>
        <EmptyState title="Couldn't load your workout" body={loadError} action="Try again" onAction={load} />
        <View style={{ marginTop: 12 }}><Button label="Back to training" variant="ghost" onPress={() => router.replace("/workouts")} /></View>
      </Screen>
    );
  if (!session)
    return (
      <Screen>
        <EmptyState title="No active workout" body="Start today's session from the plan and it'll open here." action="Go to today's plan" onAction={() => router.replace("/workouts")} />
      </Screen>
    );

  const prog = progressOf(session, ui);
  const elapsed = elapsedSec(session, ui, now);
  const liveVolKg = session.performances.reduce((n, p) => n + p.sets.filter((s) => s.completedAt && !s.isWarmup).reduce((m, s) => m + (s.weightKg ?? 0) * (s.reps ?? 0), 0), 0);
  const trainable = perfs.filter((p) => !ui.skipped.includes(p.id));
  const resting = !!ui.restEndsAt && restLeft > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Atmosphere />
      {/* HUD — leave · title + progress · pause · more, over one smooth progress line */}
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 16, paddingBottom: 10, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <HudButton icon="chevron-down" label="Leave workout" onPress={() => setSheet("end")} />
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16 }} numberOfLines={1}>{session.name}</Text>
            {trainable.length ? (
              <Text variant="meta" color="tertiary" numberOfLines={1}>
                {prog.setsDone}/{prog.setsTotal} sets · {Math.round(fromKg(liveVolKg, units)).toLocaleString()} {u}{dp.workoutClock ? ` · ${fmtClock(elapsed)}` : ""}
              </Text>
            ) : null}
          </View>
          <HudButton icon={ui.paused ? "play" : "pause"} label={ui.paused ? "Resume workout" : "Pause workout"} onPress={togglePause} active={ui.paused} />
          <HudButton icon="ellipsis-horizontal" label="Workout options" onPress={() => setSheet("menu")} />
        </View>
        <ProgressLine frac={prog.setsTotal ? prog.setsDone / prog.setsTotal : 0} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {ui.paused ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: radius.medium, backgroundColor: "rgba(255,182,97,0.12)", borderWidth: 1, borderColor: "rgba(255,182,97,0.3)" }}>
            <Text style={{ color: colors.amber }}>Workout paused · timer stopped</Text>
            <Chip label="Resume" active onPress={togglePause} />
          </View>
        ) : null}

        <MilestoneBanner m={milestone} />

        {session.performances.length === 0 ? (
          <View style={{ padding: 24, borderRadius: radius.large, borderWidth: 1, borderStyle: "dashed", borderColor: colors.lineHighlight, alignItems: "center", gap: 8 }}>
            <Text variant="heading">Empty workout</Text>
            <Text color="secondary" style={{ textAlign: "center" }}>Add exercises as you go. Log your sets, rest between them, and finish when you're done.</Text>
            <View style={{ alignSelf: "stretch", marginTop: 8 }}><Button label="Add your first exercise" variant="accent" onPress={() => setSheet("add")} /></View>
          </View>
        ) : null}

        {current ? (
          <Reanimated.View key={current.id} entering={FadeIn.duration(260)} exiting={FadeOut.duration(120)}>
            <FocusCard
                perf={current}
                ui={ui}
                units={units}
                step={step}
                position={trainable.findIndex((p) => p.id === current.id) + 1}
                total={trainable.length}
                superset={current.supersetGroup != null ? `Superset ${supersetLetter(current.supersetGroup)} · ${supersetPeers(session, current).findIndex((p) => p.id === current.id) + 1}/${supersetPeers(session, current).length}` : null}
                history={history[current.exercise.slug] ?? null}
                onPatch={(row, p) => patchDraft(current, row, p)}
              />
          </Reanimated.View>
        ) : session.performances.length ? (
          <View style={{ padding: 20, borderRadius: radius.large, backgroundColor: colors.surface, gap: 10, alignItems: "center" }}>
            <Ionicons name="checkmark-done-circle" size={36} color={colors.lime} />
            <Text variant="heading">Everything's logged</Text>
            <Text color="secondary" style={{ textAlign: "center" }}>Finish to save the session, or add another exercise.</Text>
            <View style={{ alignSelf: "stretch", gap: 10 }}>
              <Button label="Finish & save workout" variant="accent" loading={busy === "finish"} onPress={finish} />
              <Button label="Add exercise" variant="ghost" onPress={() => setSheet("add")} />
            </View>
          </View>
        ) : null}

        {current ? <SetList perf={current} ui={ui} units={units} history={history[current.exercise.slug] ?? null} onToggle={(r) => (r.done ? ask("Undo this set?", "It will be removed from your log; the numbers stay as a draft.", "Undo set", () => toggleRow(current, r)) : toggleRow(current, r))} onDelete={(r) => ask("Delete this set?", `Set ${r.n} will be removed from ${current.exercise.name}.`, "Delete", () => deleteRow(current, r), true)} /> : null}

      </ScrollView>

      {/* bottom dock — the one thing to do next, in thumb reach */}
      {current ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: colors.surfaceOpaque, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
          <Reanimated.View key={resting ? "rest" : "set"} entering={FadeIn.duration(200)}>
          {resting ? (
            <RestDock
              left={restLeft}
              total={ui.restTotal}
              showCount={!!dp.restCountdown}
              onToggleCount={() => setDevicePrefs({ restCountdown: !dp.restCountdown })}
              onAdjust={adjustRest}
              onSkip={stopRest}
              onPlay={id && restLeft >= 20 ? () => router.push({ pathname: "/workout/play", params: { session: id } }) : undefined}
            />
          ) : (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <DockButton icon="options-outline" label="Set" onPress={() => setSetOpts(true)} accessibilityLabel="Set options" />
              <DockButton
                icon="checkmark"
                label={ui.paused ? "Paused — resume to log" : (() => { const r = activeRow(current, ui); const w = workingRows(current, ui); return r?.warmup ? "Complete warm-up" : `Complete set ${w.filter((x) => x.done).length + 1}`; })()}
                tone="accent"
                wide
                row
                busy={busy === "complete"}
                disabled={ui.paused || !activeRow(current, ui)}
                onPress={completeActive}
              />
            </View>
          )}
          </Reanimated.View>
        </View>
      ) : null}

      {/* workout menu — everything that isn't "log the next set" lives here */}
      <Sheet visible={sheet === "menu"} onClose={() => setSheet(null)} title="Workout options" eyebrow={session.name}>
        <SettingRow icon="list" title="Overview" hint="All exercises, reorder, skip or do later" onPress={fromMenu(() => setSheet("overview"))} />
        {current ? <SettingRow icon="information-circle-outline" title="How to do this exercise" onPress={fromMenu(() => setSheet("howto"))} /> : null}
        {current ? <SettingRow icon="swap-horizontal" title="Replace this exercise" onPress={fromMenu(() => { setSwapFor(current); setSheet("swap"); })} /> : null}
        {current ? <SettingRow icon="time-outline" title="Machine busy — do it later" onPress={fromMenu(() => ask("Move to later?", `${current.exercise.name} goes to the end of today's session.`, "Do it later", () => defer(current, "machine busy")))} /> : null}
        <SettingRow icon={ui.paused ? "play" : "pause"} title={ui.paused ? "Resume workout" : "Pause workout"} onPress={fromMenu(togglePause)} />
        <SettingRow icon="stopwatch-outline" title={dp.workoutClock ? "Hide workout clock" : "Show workout clock"} hint={dp.workoutClock ? undefined : `${fmtDuration(elapsed)} so far`} onPress={fromMenu(() => setDevicePrefs({ workoutClock: !dp.workoutClock }))} />
        <SettingRow icon="timer-outline" title={dp.restCountdown ? "Hide rest countdown" : "Always show rest countdown"} hint="Otherwise rest shows as a bar, with the seconds in the last 10" onPress={fromMenu(() => setDevicePrefs({ restCountdown: !dp.restCountdown }))} />
        <SettingRow icon="exit-outline" title="End workout" onPress={fromMenu(() => setSheet("end"))} />
      </Sheet>

      {/* overview */}
      <Sheet visible={sheet === "overview"} onClose={() => setSheet(null)} title="Workout overview" eyebrow={session.name}>
        {perfs.map((p, i) => {
          const ph = phaseOf(p, ui);
          const rows = workingRows(p, ui);
          const header = p.supersetGroup != null && perfs[i - 1]?.supersetGroup !== p.supersetGroup;
          const icon = ph === "done" ? "checkmark-circle" : ph === "active" ? "play-circle" : ph === "deferred" ? "time-outline" : "ellipse-outline";
          const tint = ph === "done" ? colors.lime : ph === "active" ? colors.pink : ph === "deferred" ? colors.amber : colors.textTertiary;
          return (
            <View key={p.id} style={{ gap: 6 }}>
              {header ? <Label style={{ color: colors.mauve }}>SUPERSET {supersetLetter(p.supersetGroup!)} · BACK-TO-BACK, REST AFTER THE ROUND</Label> : null}
              <View style={{ padding: 12, borderRadius: radius.small, backgroundColor: ph === "active" ? "rgba(213,26,122,0.12)" : colors.surface, opacity: ph === "skipped" ? 0.5 : 1, gap: 8 }}>
                <Pressable onPress={() => ph !== "skipped" && focus(p.id)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name={icon} size={18} color={tint} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ textDecorationLine: ph === "skipped" ? "line-through" : "none" }}>{p.exercise.name}</Text>
                    <Text variant="meta" color="tertiary">{ph === "deferred" ? ui.deferred[p.id] : ph === "skipped" ? (Object.values(ui.swappedFrom).includes(p.exercise.name) ? "replaced" : "skipped") : `${rows.filter((r) => r.done).length}/${rows.length} sets`}</Text>
                  </View>
                </Pressable>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {ph !== "skipped" && ph !== "done" && ph !== "deferred" ? <Chip label="Do later" onPress={() => ask("Move to later?", `${p.exercise.name} goes to the end of today's session.`, "Do it later", () => defer(p, "do later"))} /> : null}
                  {ph === "deferred" ? <Chip label="Resume now" active onPress={() => resume(p)} /> : null}
                  {ph !== "skipped" ? <Chip label="Replace" onPress={() => { setSwapFor(p); setSheet("swap"); }} /> : null}
                  {ph === "skipped" ? <Chip label="Add back" onPress={() => setSkip(p, false)} /> : ph !== "done" ? <Chip label="Skip" onPress={() => ask("Skip this exercise?", `${p.exercise.name} won't be counted today. You can add it back from the overview.`, "Skip", () => setSkip(p, true), true)} /> : null}
                </View>
              </View>
            </View>
          );
        })}
        <Button label="Add exercise" variant="ghost" icon={<Ionicons name="add" size={18} color={colors.onColor} />} onPress={() => setSheet("add")} />
        <Text variant="meta" color="tertiary">Changes apply to today's session only — your saved plan isn't touched.</Text>
      </Sheet>

            {(() => {
        const r = current ? activeRow(current, ui) : null;
        if (!current || !r) return null;
        return (
          <Sheet visible={setOpts} onClose={() => setSetOpts(false)} title="Set options" eyebrow={current.exercise.name}>
            <Stepper label="rpe (effort 1–10)" value={r.rpe} step={0.5} max={10} onChange={(v) => patchDraft(current, r, { rpe: v })} />
            <SettingRow icon="add-circle-outline" title="Add a set" onPress={() => { setSetOpts(false); addSet(current, false); }} />
            <SettingRow icon="flame-outline" title="Add a warm-up set" onPress={() => { setSetOpts(false); addSet(current, true); }} />
            <SettingRow icon="flame" title={r.warmup ? "This is a working set" : "Mark this as a warm-up"} onPress={() => { setSetOpts(false); patchDraft(current, r, { warmup: !r.warmup }); }} />
            <SettingRow icon="infinite" title={r.amrap ? "Unmark AMRAP" : "AMRAP — as many reps as possible"} onPress={() => { setSetOpts(false); patchUI((c) => ({ ...c, amrap: r.amrap ? c.amrap.filter((k) => k !== setKey(current.id, r.n)) : [...c.amrap, setKey(current.id, r.n)] })); }} />
          </Sheet>
        );
      })()}

      <ExercisePicker visible={sheet === "add"} onClose={() => setSheet(null)} onPick={addExercise} />
      <ExercisePicker visible={sheet === "swapLibrary"} title="Replace from library" onClose={() => setSheet(null)} onPick={(e) => { if (!swapFor) return; const target = swapFor; ask("Replace exercise?", `${target.exercise.name} will be replaced by ${e.name} for today only.`, "Replace", () => void swapTo(target, e.id, e.name)); }} />
      <SwapSheet perf={sheet === "swap" ? swapFor : null} onClose={() => setSheet(null)} onPick={(s) => { if (!swapFor) return; const target = swapFor; ask("Replace exercise?", `${target.exercise.name} will be replaced by ${s.name} for today only.`, "Replace", async () => { try { const found = await api.library.exercise(s.slug); await swapTo(target, found.id, found.name); } catch (e) { toast.error(errorMessage(e as Error)); } }); }} onLibrary={() => setSheet("swapLibrary")} />
      <ExerciseDetailSheet slug={sheet === "howto" && current ? current.exercise.slug : null} preview={current?.exercise} onClose={() => setSheet(null)} />

      {/* leave / finish */}
      <Sheet visible={sheet === "end"} onClose={() => setSheet(null)} title={prog.setsDone && prog.setsDone === prog.setsTotal ? "Everything's logged" : "Leave workout?"}>
        <Text color="secondary">{prog.exercisesDone}/{prog.exercisesTotal} exercises · {prog.setsDone}/{prog.setsTotal} sets logged · {fmtDuration(elapsed)}</Text>
        <Button label="Finish & save workout" variant="accent" loading={busy === "finish"} disabled={!prog.setsDone} onPress={finish} />
        {!prog.setsDone ? <Text variant="meta" color="tertiary">Log at least one set to save this workout.</Text> : null}
        <Button label="Continue workout" variant="ghost" onPress={() => setSheet(null)} />
        <Button label="Pause & exit — resume later" variant="ghost" onPress={pauseAndExit} />
        <Pressable onPress={() => ask("Discard this workout?", "Everything logged in this session will be deleted. This can't be undone.", "Discard", discard, true)} disabled={busy === "discard"} style={{ alignItems: "center", paddingVertical: 12 }} accessibilityRole="button">
          <Text style={{ color: colors.danger }}>{busy === "discard" ? "Discarding…" : "Discard without saving"}</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────

function MilestoneBanner({ m }: { m: { kind: "pr" | "exercise"; title: string; detail?: string } | null }) {
  const a = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(m);
  useEffect(() => {
    if (m) {
      setShown(m);
      a.setValue(0);
      Animated.spring(a, { toValue: 1, useNativeDriver: true, stiffness: 300, damping: 18 }).start();
    } else Animated.timing(a, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setShown(null));
  }, [m, a]);
  if (!shown) return null;
  const pr = shown.kind === "pr";
  return (
    <Animated.View accessibilityLiveRegion="polite" style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }, { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }], flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.medium, backgroundColor: pr ? "rgba(255,182,97,0.14)" : "rgba(216,255,99,0.10)", borderWidth: 1, borderColor: pr ? "rgba(255,182,97,0.4)" : "rgba(216,255,99,0.3)" }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: pr ? "rgba(255,182,97,0.22)" : "rgba(216,255,99,0.16)" }}>
        <Ionicons name={pr ? "trophy" : "checkmark"} size={18} color={pr ? colors.amber : colors.lime} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.semibold, color: pr ? colors.amber : colors.lime }}>{shown.title}</Text>
        {shown.detail ? <Text variant="meta" color="secondary">{shown.detail}</Text> : null}
      </View>
    </Animated.View>
  );
}

function FocusCard(props: {
  perf: ExercisePerformance;
  ui: ActiveUI;
  units: Units;
  step: number;
  position: number;
  total: number;
  superset: string | null;
  history: ExerciseHistory | null;
  onPatch: (row: SetRow, p: Partial<{ weightKg: number | null; reps: number | null; rpe: number | null; warmup: boolean }>) => void;
}) {
  const { perf, ui, units } = props;
  const u = unitLabel(units);
  const rows = setRows(perf, ui);
  const row = activeRow(perf, ui);
  const working = rows.filter((r) => !r.warmup);
  const doneW = working.filter((r) => r.done).length;
  // same source as the website: the API url if there is one, else the RepDB illustration matched by name
  const cat = useMemo(() => repdbEntryFor(perf.exercise.name), [perf.exercise.name]);
  const frames = [perf.exercise.imageStartUrl ?? repdbImage(cat?.imgStart), perf.exercise.imageEndUrl ?? repdbImage(cat?.imgEnd)].filter(Boolean) as string[];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (frames.length < 2) return;
    const t = setInterval(() => setFrame((f) => (f ? 0 : 1)), 900);
    return () => clearInterval(t);
  }, [frames.length]);
  const lastSets = props.history?.history[0]?.sets.filter((s) => s.weightKg != null || s.reps != null) ?? [];
  const bodyweight = !!perf.exercise.isBodyweight;
  const wDisp = row?.weightKg != null ? fromKg(row.weightKg, units) : null;
  const plates = wDisp != null && !bodyweight ? plateCombo(wDisp, units === "metric" ? 20 : 45, u) : null;

  const fillPrevious = () => {
    if (!row || !lastSets.length) return;
    const top = [...lastSets].sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0))[0];
    props.onPatch(row, { weightKg: top.weightKg, reps: top.reps });
    Haptics.selectionAsync().catch(() => {});
  };

  if (!row) return null;
  const tags = [row.rpe != null ? `RPE ${row.rpe}` : null, row.amrap ? "AMRAP" : null].filter(Boolean).join(" · ");
  return (
    <View style={{ gap: 20 }}>
      {frames.length ? (
        <View style={{ height: 160, borderRadius: radius.large, overflow: "hidden", backgroundColor: "#fff" }}>
          <Image source={{ uri: frames[frame % frames.length] }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel={`${perf.exercise.name} demonstration`} />
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <Label>
          {props.superset ? `${props.superset.toUpperCase()} · ` : ""}EXERCISE {props.position} OF {props.total}{ui.swappedFrom[perf.id] ? ` · SWAPPED FROM ${ui.swappedFrom[perf.id].toUpperCase()}` : ""}
        </Label>
        <Text style={{ fontFamily: fonts.light, fontSize: 30, lineHeight: 34, letterSpacing: -0.6 }}>{perf.exercise.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          {row.warmup ? (
            <Text style={{ fontFamily: fonts.semibold, color: colors.cyan }}>Warm-up set</Text>
          ) : (
            <>
              <Num size={22} style={{ color: colors.pink }}>{doneW + 1}</Num>
              <Text color="tertiary">of {working.length} sets · {ui.targets[perf.id] ?? "3 × 8–12"}{tags ? ` · ${tags}` : ""}</Text>
            </>
          )}
        </View>
      </View>

      <View style={{ gap: 14 }}>
        {!bodyweight ? (
          <View style={{ flexDirection: "row" }}>
            <Stepper large label="weight" suffix={u} value={wDisp} step={props.step} max={2000} onChange={(v) => props.onPatch(row, { weightKg: v == null ? null : toKg(v, units) })} />
          </View>
        ) : null}
        <View style={{ flexDirection: "row" }}>
          <Stepper large label={row.amrap ? "reps · amrap" : "reps"} value={row.reps} step={1} max={200} onChange={(v) => props.onPatch(row, { reps: v == null ? null : Math.round(v) })} placeholder={row.amrap ? "max" : "—"} />
        </View>
      </View>

      {lastSets.length ? (
        <Pressable onPress={fillPrevious} accessibilityHint="Fills the set with your last top set" style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40 }}>
          <Ionicons name="time-outline" size={16} color={colors.textTertiary} />
          <Text variant="meta" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
            Last time {lastSets.slice(0, 3).map((s) => `${s.weightKg != null ? fromKg(s.weightKg, units) : "BW"}×${s.reps ?? "—"}`).join("  ")}
          </Text>
          <Text variant="meta" color="pink">Use</Text>
        </Pressable>
      ) : null}

      {plates && plates.perSide.length ? (
        <Text variant="meta" color="tertiary">Plates per side · {plateLabel(plates.perSide)}{plates.loaded !== wDisp ? ` → loads ${plates.loaded} ${u}` : ""}</Text>
      ) : null}
    </View>
  );
}

/** One slim progress line for the whole session; the fill glides instead of jumping. */
function ProgressLine({ frac }: { frac: number }) {
  const w = useSharedValue(frac);
  useEffect(() => {
    w.set(withTiming(frac, { duration: motion.reduced ? 0 : 450, easing: EASE_LUXURY }));
  }, [frac, w]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, w.get())) * 100}%` }));
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
      <Reanimated.View style={[{ height: 4, borderRadius: 2, backgroundColor: colors.pink }, fill]} />
    </View>
  );
}

type IconName = keyof typeof Ionicons.glyphMap;

function HudButton({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={label} to={0.92} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: active ? "rgba(255,182,97,0.2)" : colors.surface }}>
      <Ionicons name={icon} size={20} color={active ? colors.amber : colors.textPrimary} />
    </PressScale>
  );
}

/** Big bottom-dock button. `wide` takes the free space; `row` lays icon and label side by side. */
function DockButton({ icon, label, onPress, tone = "plain", wide, row, busy, disabled, accessibilityLabel }: { icon: IconName; label: string; onPress: () => void; tone?: "plain" | "accent" | "lime" | "cyan"; wide?: boolean; row?: boolean; busy?: boolean; disabled?: boolean; accessibilityLabel?: string }) {
  const bg = tone === "accent" ? colors.pink : tone === "lime" ? colors.lime : tone === "cyan" ? "rgba(131,233,244,0.16)" : colors.surface;
  const ink = tone === "accent" ? colors.onAccent : tone === "lime" ? "#1a1a1a" : tone === "cyan" ? colors.cyan : colors.textPrimary;
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || busy}
      haptic="medium"
      accessibilityLabel={accessibilityLabel ?? label}
      style={{ flex: wide ? 2.4 : 1, height: 64, borderRadius: 22, backgroundColor: bg, alignItems: "center", justifyContent: "center", flexDirection: row ? "row" : "column", gap: row ? 10 : 2 }}
    >
      {busy ? <ActivityIndicator color={ink} /> : <Ionicons name={icon} size={row ? 24 : 22} color={ink} />}
      <Text numberOfLines={1} style={{ color: ink, fontFamily: fonts.semibold, fontSize: row ? 18 : 13 }}>{label}</Text>
    </PressScale>
  );
}

/**
 * Rest, as a slim bar in the dock instead of a big ring: the next set stays on
 * screen to prep. Seconds are hidden unless you tap the bar (remembered) or
 * it's the last 10 s; the phone still buzzes when rest ends.
 */
function RestDock({ left, total, showCount, onToggleCount, onAdjust, onSkip, onPlay }: { left: number; total: number; showCount: boolean; onToggleCount: () => void; onAdjust: (d: number) => void; onSkip: () => void; onPlay?: () => void }) {
  const frac = Math.max(0, Math.min(1, left / Math.max(1, total)));
  const reveal = showCount || left <= 10;
  const low = left <= 10;
  return (
    <View style={{ gap: 12 }}>
      <Pressable onPress={onToggleCount} accessibilityRole="button" accessibilityLabel={reveal ? `${left} seconds of rest left. Tap to hide the countdown` : "Resting. Tap to show the countdown"} style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 }}>
          <Ionicons name="timer-outline" size={16} color={low ? colors.amber : colors.lime} />
          <Text style={{ flex: 1, fontFamily: fonts.semibold, color: low ? colors.amber : colors.lime }}>{low ? "Get ready" : "Resting"}</Text>
          {reveal ? <Num size={20} style={{ color: low ? colors.amber : colors.textPrimary }}>{fmtClock(left)}</Num> : <Ionicons name="eye-outline" size={18} color={colors.textTertiary} />}
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <RestFill frac={frac} color={low ? colors.amber : colors.lime} />
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <DockButton icon="remove" label="15s" onPress={() => onAdjust(-15)} accessibilityLabel="15 seconds less rest" />
        {onPlay ? <DockButton icon="game-controller" label="Play" tone="cyan" onPress={onPlay} accessibilityLabel="Play a game while you rest" /> : null}
        <DockButton icon="play-forward" label="Ready" tone="lime" wide onPress={onSkip} accessibilityLabel="End rest, ready for the next set" />
        <DockButton icon="add" label="15s" onPress={() => onAdjust(15)} accessibilityLabel="15 seconds more rest" />
      </View>
    </View>
  );
}

function RestFill({ frac, color }: { frac: number; color: string }) {
  const w = useSharedValue(frac);
  useEffect(() => {
    w.set(withTiming(frac, { duration: 300, easing: Easing.linear }));
  }, [frac, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return <Reanimated.View style={[{ height: 6, borderRadius: 3, backgroundColor: color }, style]} />;
}

function SetList({ perf, ui, units, onToggle, onDelete }: { perf: ExercisePerformance; ui: ActiveUI; units: Units; history: ExerciseHistory | null; onToggle: (r: SetRow) => void; onDelete: (r: SetRow) => void }) {
  const u = unitLabel(units);
  const rows = setRows(perf, ui);
  let wi = 0;
  return (
    <View style={{ gap: 6 }}>
      <Label style={{ marginLeft: 4 }}>SETS</Label>
      {rows.map((r) => {
        const idx = r.warmup ? -1 : wi++;
        return (
          <Reanimated.View key={r.n} layout={LinearTransition.duration(240)} entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)}>
            <Pressable
              onLongPress={() => onDelete(r)}
              delayLongPress={450}
              accessibilityHint="Hold to delete this set"
              style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingLeft: 14, paddingRight: 6, borderRadius: radius.small, backgroundColor: r.done ? "rgba(216,255,99,0.08)" : colors.surface }}
            >
              <Text style={{ width: 30, fontFamily: fonts.num, color: r.warmup ? colors.cyan : colors.textTertiary }}>{r.warmup ? "W" : idx + 1}</Text>
              <Text style={{ flex: 1, fontFamily: fonts.num, fontSize: 16, opacity: r.done ? 0.9 : 0.75 }}>
                {r.weightKg != null ? `${fromKg(r.weightKg, units)} ${u}` : "—"} × {r.amrap && r.reps == null ? "AMRAP" : r.reps ?? "—"}
                {r.rpe != null ? ` @ ${r.rpe}` : ""}
              </Text>
              <Pressable onPress={() => onToggle(r)} hitSlop={4} accessibilityLabel={r.done ? "Mark set not done" : "Mark set done"} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: r.done ? colors.lime : "rgba(255,255,255,0.08)" }}>
                <Ionicons name="checkmark" size={20} color={r.done ? "#1a1a1a" : colors.textTertiary} />
              </Pressable>
            </Pressable>
          </Reanimated.View>
        );
      })}
      <Text variant="meta" color="tertiary" style={{ marginLeft: 4 }}>Hold a set to delete it</Text>
    </View>
  );
}

function SwapSheet({ perf, onClose, onPick, onLibrary }: { perf: ExercisePerformance | null; onClose: () => void; onPick: (s: SwapSuggestion) => void; onLibrary: () => void }) {
  const [items, setItems] = useState<SwapSuggestion[] | null>(null);
  useEffect(() => {
    if (!perf) return;
    setItems(null);
    api.workouts
      .swapSuggestions({ exerciseSlug: perf.exercise.slug })
      .then((r) => setItems(r.recommended.length ? r.recommended : r.all))
      .catch(() => setItems([]));
  }, [perf]);
  return (
    <Sheet visible={!!perf} onClose={onClose} title="Replace exercise" eyebrow={perf?.exercise.name}>
      <Text color="secondary">Same primary muscle and movement — sets already logged stay in today's session.</Text>
      {items === null ? <Text color="tertiary">Finding alternatives…</Text> : items.length === 0 ? <Text color="secondary">No close match — try the library.</Text> : null}
      {items?.slice(0, 8).map((s) => (
        <Pressable key={s.slug} onPress={() => onPick(s)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
          <ExerciseThumb uri={(s as SwapSuggestion & { imageStartUrl?: string | null }).imageStartUrl} name={s.name} size={40} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1}>{s.name}</Text>
            <Text variant="meta" color="tertiary" numberOfLines={2}>{s.rationale ?? s.reasons.join(" · ")}</Text>
          </View>
          <Ionicons name="swap-horizontal" size={18} color={colors.textSecondary} />
        </Pressable>
      ))}
      <Button label="Browse full library" variant="ghost" onPress={onLibrary} />
    </Sheet>
  );
}

function SummaryView({ summary, units, look, savedTpl, onSaveTpl, onRepeat, onDone, onProgress }: { summary: Summary; units: Units; look?: string; savedTpl: boolean; onSaveTpl: () => void; onRepeat: () => void; onDone: () => void; onProgress: () => void }) {
  const u = unitLabel(units);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, stiffness: 220, damping: 20 }).start();
  }, [pop]);
  const s = summary;
  const dv = s.vsLast ? Math.round(fromKg(s.vsLast.volumeKg, units)) : 0;
  return (
    <Screen>
      <Animated.View style={{ gap: 14, opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 8 }}>
          <KaiOrb size={44} state="happy" look={look} />
          <View style={{ flex: 1 }}>
            <Label style={{ color: colors.lime }}>WORKOUT COMPLETE</Label>
            <Text variant="title" numberOfLines={2}>{s.session.name}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {[["Time", fmtDuration(s.durationSec)], ["Volume", `${Math.round(fromKg(s.volumeKg, units)).toLocaleString()}`], ["Sets", String(s.sets)]].map(([l, v]) => (
            <View key={l} style={{ flex: 1, padding: 14, borderRadius: radius.medium, backgroundColor: colors.surface, gap: 6 }}>
              <Num size={22}>{v}</Num>
              <Label>{l === "Volume" ? `VOLUME · ${u.toUpperCase()}` : l.toUpperCase()}</Label>
            </View>
          ))}
        </View>
        {s.xp > 0 || s.coins > 0 ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radius.medium, backgroundColor: "rgba(255,255,255,0.06)" }}>
              <Ionicons name="trending-up" size={16} color={colors.pink} />
              <Num size={16}>+{s.xp}</Num>
              <Text color="secondary">rank XP</Text>
            </View>
            {s.coins > 0 ? (
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radius.medium, backgroundColor: "rgba(255,182,97,0.12)" }}>
                <Ionicons name="logo-bitcoin" size={16} color={colors.amber} />
                <Num size={16} style={{ color: colors.amber }}>+{s.coins}</Num>
                <Text color="secondary">coins</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {s.coinLines.length > 1 ? (
          <View style={{ gap: 4, paddingHorizontal: 4 }}>
            {s.coinLines.map((l) => (
              <View key={l.label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text variant="meta" color="secondary">{l.label}</Text>
                <Num size={13} style={{ color: colors.amber }}>+{l.amount}</Num>
              </View>
            ))}
          </View>
        ) : null}
        {s.streakWeeks > 0 || s.rank ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
            <Ionicons name="flame" size={15} color={colors.amber} />
            <Text color="secondary" style={{ flex: 1 }}>
              {[s.streakWeeks > 0 ? `${s.streakWeeks}-week streak${s.targetHit ? " · weekly target hit" : ""}` : null, s.rank].filter(Boolean).join(" · ")}
            </Text>
          </View>
        ) : null}
        {s.prs.length ? (
          <View style={{ padding: 14, borderRadius: radius.medium, backgroundColor: "rgba(216,255,99,0.08)", gap: 6 }}>
            <Text style={{ fontFamily: fonts.semibold, color: colors.lime }}>{s.prs.length} personal record{s.prs.length > 1 ? "s" : ""}</Text>
            {s.prs.map((p) => <Text key={p} color="secondary">· {p}</Text>)}
          </View>
        ) : null}
        {s.muscles.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{s.muscles.map((m) => <View key={m} style={{ paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: "rgba(213,26,122,0.16)", justifyContent: "center" }}><Text variant="meta" style={{ color: colors.pinkSoft }}>{m.toLowerCase()}</Text></View>)}</View> : null}
        {s.vsLast ? (
          <Text color="secondary">
            vs last time: <Text style={{ color: dv >= 0 ? colors.lime : colors.amber }}>{dv >= 0 ? "+" : ""}{dv.toLocaleString()} {u} volume</Text> · {s.vsLast.durationSec >= 0 ? "+" : ""}{Math.round(s.vsLast.durationSec / 60)} min
          </Text>
        ) : null}
        {s.protein ? (
          <View style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: radius.medium, backgroundColor: colors.surface, alignItems: "center" }}>
            <Ionicons name="flash" size={15} color={colors.cyan} />
            <Text color="secondary" style={{ flex: 1 }}>Protein today: <Text>{s.protein.eaten}g</Text> of <Text>{s.protein.target}g</Text> — log a meal to hit your goal.</Text>
          </View>
        ) : null}
        {s.session.trainerComment ? <View style={{ padding: 14, borderRadius: radius.medium, backgroundColor: colors.surface, gap: 6 }}><Label>FROM YOUR TRAINER</Label><Text color="secondary">{s.session.trainerComment}</Text></View> : <Text color="secondary" style={{ fontStyle: "italic" }}>"{trainerCue("finish")}"</Text>}
        {s.session.progression?.nextUnlock ? <View style={{ padding: 14, borderRadius: radius.medium, backgroundColor: colors.surface, gap: 6 }}><Label>NEXT UNLOCK</Label><Text color="secondary">{s.session.progression.nextUnlock.requirement}</Text></View> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Button label="Done" onPress={onDone} /></View>
          <View style={{ flex: 1 }}><Button label="Progress" variant="ghost" onPress={onProgress} /></View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 24 }}>
          <Pressable onPress={onRepeat} hitSlop={8}><Text color="secondary">Repeat workout</Text></Pressable>
          <Pressable onPress={onSaveTpl} disabled={savedTpl} hitSlop={8}><Text color={savedTpl ? "tertiary" : "secondary"}>{savedTpl ? "Saved ✓" : "Save as template"}</Text></Pressable>
        </View>
      </Animated.View>
    </Screen>
  );
}
