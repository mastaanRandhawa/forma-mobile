import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, TextInput, Vibration, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { api } from "@/api/client";
import { invalidateResource } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import type { Exercise, ExercisePerformance, ExerciseSet, SwapSuggestion, WorkoutSession } from "@/api/types";
import { fmtClock, fmtDuration, fromKg, saveSessionAsTemplate, toKg, unitLabel, type Units } from "@/lib/workouts";
import { plateCombo, plateLabel } from "@/lib/plates";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Card, EmptyState, PageSkeleton, Sheet } from "@/components/ui/extra";
import { Button, Chip, ProgressBar } from "@/components/ui/controls";
import { Label, Num, Text } from "@/components/ui/text";

const COMPOUND_REST = 120;
const ISOLATION_REST = 75;
const adaptiveRest = (mechanic: string | null | undefined, lastRpe: number | null | undefined) =>
  ((lastRpe ?? 0) >= 9 ? 30 : 0) + (mechanic === "compound" ? COMPOUND_REST : ISOLATION_REST);

type SetDraft = { weight: string; reps: string; rpe: string };

export default function ActiveWorkout() {
  useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const units: Units = user?.unitPreference ?? "imperial";
  const u = unitLabel(units);

  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [paused, setPaused] = useState<{ at: number; total: number } | null>(null);
  const [restEnds, setRestEnds] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(90);
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [adding, setAdding] = useState(false);
  const [swapFor, setSwapFor] = useState<ExercisePerformance | null>(null);
  const [plateFor, setPlateFor] = useState<number | null>(null);
  const [summary, setSummary] = useState<WorkoutSession | null>(null);
  const [finishing, setFinishing] = useState(false);
  const pausedMs = useRef(0);

  // ── load the in-progress session ─────────────────────────────────────────
  useEffect(() => {
    api.sessions
      .list({ status: "in_progress", take: 1 })
      .then((l) => (l[0] ? api.sessions.get(l[0].id) : null))
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const elapsed = session ? Math.max(0, Math.floor(((paused ? paused.at : now) - Date.parse(session.startedAt) - pausedMs.current) / 1000)) : 0;
  const restLeft = restEnds ? Math.max(0, Math.ceil((restEnds - now) / 1000)) : 0;

  useEffect(() => {
    if (restEnds && restLeft <= 0) {
      setRestEnds(null);
      Vibration.vibrate([0, 200, 100, 200]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [restEnds, restLeft]);

  const startRest = (sec: number) => {
    setRestTotal(sec);
    setRestEnds(Date.now() + sec * 1000);
  };

  const togglePause = () => {
    if (paused) {
      pausedMs.current += Date.now() - paused.at;
      setPaused(null);
    } else setPaused({ at: Date.now(), total: 0 });
  };

  // ── set editing ──────────────────────────────────────────────────────────
  const draftKey = (perfId: string, n: number) => `${perfId}:${n}`;
  const setValue = (perf: ExercisePerformance, set: ExerciseSet | undefined, n: number): SetDraft => {
    const d = drafts[draftKey(perf.id, n)];
    if (d) return d;
    const w = set?.weightKg ?? perf.prescribedWeightKg ?? null;
    return {
      weight: w != null ? String(fromKg(w, units)) : "",
      reps: String(set?.reps ?? perf.prescribedReps ?? ""),
      rpe: set?.rpe != null ? String(set.rpe) : "",
    };
  };
  const patchDraft = (perfId: string, n: number, cur: SetDraft, p: Partial<SetDraft>) =>
    setDrafts((d) => ({ ...d, [draftKey(perfId, n)]: { ...cur, ...p } }));

  const replacePerf = (perf: ExercisePerformance) =>
    setSession((s) => (s ? { ...s, performances: s.performances.map((p) => (p.id === perf.id ? perf : p)) } : s));

  const completeSet = async (perf: ExercisePerformance, n: number, done: boolean, warmup = false) => {
    if (!session) return;
    const existing = perf.sets.find((s) => s.setNumber === n);
    const d = setValue(perf, existing, n);
    const weight = parseFloat(d.weight);
    const reps = parseInt(d.reps, 10);
    const rpe = parseFloat(d.rpe);
    try {
      const saved = await api.sessions.logSet(session.id, perf.id, n, {
        weightKg: Number.isFinite(weight) ? toKg(weight, units) : null,
        reps: Number.isFinite(reps) ? reps : null,
        rpe: Number.isFinite(rpe) ? rpe : null,
        isWarmup: existing?.isWarmup ?? warmup,
        completed: done,
      });
      const sets = [...perf.sets.filter((s) => s.setNumber !== n), saved].sort((a, b) => a.setNumber - b.setNumber);
      replacePerf({ ...perf, sets });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (done && !saved.isWarmup) startRest(adaptiveRest(perf.exercise.mechanic as string | undefined, Number.isFinite(rpe) ? rpe : null));
    } catch (e) {
      Alert.alert("Couldn't save set", e instanceof Error ? e.message : "Try again.");
    }
  };

  const addSet = (perf: ExercisePerformance) => {
    const n = Math.max(0, ...perf.sets.map((s) => s.setNumber)) + 1;
    replacePerf({ ...perf, sets: [...perf.sets, { id: `tmp-${n}`, setNumber: n, weightKg: perf.sets.at(-1)?.weightKg ?? null, reps: perf.sets.at(-1)?.reps ?? null, rpe: null, restSecondsTaken: null, isWarmup: false, completedAt: null, formScore: null, romValue: null, isPersonalRecord: false }] });
  };

  const removeSet = async (perf: ExercisePerformance, n: number) => {
    if (!session) return;
    await api.sessions.deleteSet(session.id, perf.id, n).catch(() => {});
    replacePerf({ ...perf, sets: perf.sets.filter((s) => s.setNumber !== n) });
  };

  // ── add / swap exercise ──────────────────────────────────────────────────
  const addExercise = async (ex: Exercise) => {
    if (!session) return;
    const order = Math.max(-1, ...session.performances.map((p) => p.order)) + 1;
    try {
      const perf = await api.sessions.addPerformance(session.id, ex.id, order);
      setSession({ ...session, performances: [...session.performances, perf] });
      setAdding(false);
    } catch (e) {
      Alert.alert("Couldn't add exercise", e instanceof Error ? e.message : "Try again.");
    }
  };

  const swap = async (perf: ExercisePerformance, slug: string) => {
    if (!session) return;
    try {
      const found = await api.library.exercise(slug);
      const next = await api.sessions.addPerformance(session.id, found.id, perf.order);
      setSession({ ...session, performances: session.performances.map((p) => (p.id === perf.id ? next : p)) });
      setSwapFor(null);
    } catch (e) {
      Alert.alert("Couldn't swap", e instanceof Error ? e.message : "Try again.");
    }
  };

  // ── finish / abandon ─────────────────────────────────────────────────────
  const finish = async () => {
    if (!session) return;
    setFinishing(true);
    try {
      const done = await api.sessions.finish(session.id, { durationSeconds: elapsed });
      invalidateResource();
      setSummary(done);
    } catch (e) {
      Alert.alert("Couldn't finish", e instanceof Error ? e.message : "Try again.");
    } finally {
      setFinishing(false);
    }
  };

  const confirmFinish = () => {
    const open = session?.performances.reduce((n, p) => n + p.sets.filter((s) => !s.completedAt).length, 0) ?? 0;
    Alert.alert("Finish workout?", open ? `${open} sets aren't logged yet.` : "Nice work.", [
      { text: "Keep going", style: "cancel" },
      { text: "Finish", onPress: finish },
    ]);
  };

  const abandon = () =>
    Alert.alert("Discard workout?", "This session won't be saved.", [
      { text: "Keep going", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: async () => { if (session) await api.sessions.abandon(session.id).catch(() => {}); invalidateResource(); router.replace("/workouts"); } },
    ]);

  const progress = useMemo(() => {
    const all = session?.performances.flatMap((p) => p.sets) ?? [];
    const total = session?.performances.reduce((n, p) => n + Math.max(p.sets.length, 1), 0) ?? 0;
    return { done: all.filter((s) => s.completedAt).length, total };
  }, [session]);

  if (loading) return <Screen><PageSkeleton /></Screen>;
  if (!session)
    return (
      <Screen>
        <EmptyState title="No workout in progress" body="Start one from the Training tab." action="Go to training" onAction={() => router.replace("/workouts")} />
      </Screen>
    );

  // ── summary ──────────────────────────────────────────────────────────────
  if (summary) {
    return (
      <Screen>
        <Text variant="title">Workout complete</Text>
        <Text color="secondary" style={{ marginBottom: 16 }}>{summary.name}</Text>
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            <Stat label="TIME" value={fmtDuration(summary.durationSeconds || elapsed)} />
            <Stat label="VOLUME" value={`${Math.round(fromKg(summary.totalVolumeKg, units)).toLocaleString()} ${u}`} />
            <Stat label="SETS" value={String(summary.performances.reduce((n, p) => n + p.sets.filter((s) => s.completedAt).length, 0))} />
          </View>
        </Card>
        {summary.personalRecords?.length ? (
          <Card title="New records">
            {summary.personalRecords.map((pr) => (
              <View key={pr.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                <Text>{pr.exercise?.name ?? "Record"}</Text>
                <Num size={16} style={{ color: colors.lime }}>{pr.recordType === "max_reps" ? pr.value : `${Math.round(fromKg(pr.value, units))} ${u}`}</Num>
              </View>
            ))}
          </Card>
        ) : null}
        {summary.trainerComment ? <Card title="From your trainer"><Text color="secondary">{summary.trainerComment}</Text></Card> : null}
        {summary.progression?.nextUnlock ? <Card title="Next unlock"><Text color="secondary">{summary.progression.nextUnlock.requirement}</Text></Card> : null}
        <View style={{ gap: 10 }}>
          <Button label="Save as template" variant="ghost" onPress={async () => { try { await saveSessionAsTemplate(summary); Alert.alert("Saved", "Find it under Templates."); } catch { Alert.alert("Couldn't save"); } }} />
          <Button label="Done" onPress={() => router.replace("/dashboard")} />
        </View>
      </Screen>
    );
  }

  return (
    <>
      <Screen>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-down" size={24} color={colors.textSecondary} /></Pressable>
          <View style={{ flexDirection: "row", gap: 18 }}>
            <Pressable onPress={togglePause} hitSlop={10}><Ionicons name={paused ? "play" : "pause"} size={22} color={colors.textSecondary} /></Pressable>
            <Pressable onPress={abandon} hitSlop={10}><Ionicons name="trash-outline" size={22} color={colors.textSecondary} /></Pressable>
          </View>
        </View>
        <Text variant="title">{session.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6, marginBottom: 12 }}>
          <Num size={22}>{fmtClock(elapsed)}</Num>
          <Text color="tertiary">{paused ? "Paused" : `${progress.done}/${progress.total} sets`}</Text>
        </View>
        <ProgressBar pct={progress.total ? (progress.done / progress.total) * 100 : 0} />

        {restEnds ? (
          <Card style={{ marginTop: 16, alignItems: "center", gap: 10 }}>
            <Label>REST</Label>
            <Num size={56}>{fmtClock(restLeft)}</Num>
            <ProgressBar pct={(restLeft / Math.max(restTotal, 1)) * 100} tone="cyan" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip label="−15s" onPress={() => setRestEnds((e) => (e ? e - 15000 : e))} />
              <Chip label="+15s" onPress={() => setRestEnds((e) => (e ? e + 15000 : e))} />
              <Chip label="Skip" active onPress={() => setRestEnds(null)} />
            </View>
          </Card>
        ) : null}

        <View style={{ marginTop: 18, gap: 14 }}>
          {session.performances.length === 0 ? (
            <Text color="secondary">Add exercises as you go. Log your sets, rest between them, and finish when you're done.</Text>
          ) : null}
          {session.performances.map((perf) => (
            <Card key={perf.id} style={{ marginBottom: 0 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text variant="heading" style={{ fontSize: 18 }}>{perf.exercise.name}</Text>
                  {perf.supersetGroup != null ? <Label>SUPERSET {String.fromCharCode(64 + perf.supersetGroup)}</Label> : null}
                  {perf.prescribedWeightKg || perf.prescribedReps ? (
                    <Text variant="meta" color="tertiary">Target {perf.prescribedWeightKg ? `${fromKg(perf.prescribedWeightKg, units)} ${u} × ` : ""}{perf.prescribedReps ?? "—"}{perf.prescribedRpe ? ` @ RPE ${perf.prescribedRpe}` : ""}</Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <Pressable hitSlop={8} onPress={() => setPlateFor(parseFloat(setValue(perf, perf.sets[0], perf.sets[0]?.setNumber ?? 1).weight) || 0)}><Ionicons name="disc-outline" size={20} color={colors.textSecondary} /></Pressable>
                  <Pressable hitSlop={8} onPress={() => setSwapFor(perf)}><Ionicons name="swap-horizontal" size={20} color={colors.textSecondary} /></Pressable>
                </View>
              </View>
              <View style={{ flexDirection: "row", marginTop: 12, paddingHorizontal: 4 }}>
                <Label style={{ width: 32 }}>SET</Label>
                <Label style={{ flex: 1, textAlign: "center" }}>{u.toUpperCase()}</Label>
                <Label style={{ flex: 1, textAlign: "center" }}>REPS</Label>
                <Label style={{ flex: 1, textAlign: "center" }}>RPE</Label>
                <View style={{ width: 44 }} />
              </View>
              {perf.sets.map((set) => {
                const d = setValue(perf, set, set.setNumber);
                const done = !!set.completedAt;
                const cell = { flex: 1, height: 42, marginHorizontal: 3, borderRadius: 12, backgroundColor: done ? "rgba(216,255,99,0.10)" : colors.surfaceRecessed, color: colors.textPrimary, textAlign: "center" as const, fontFamily: fonts.num, fontSize: 16 };
                return (
                  <View key={set.id} style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                    <Pressable onLongPress={() => removeSet(perf, set.setNumber)} style={{ width: 32 }}>
                      <Text color={set.isWarmup ? "pink" : "tertiary"} style={{ fontSize: 14 }}>{set.isWarmup ? "W" : set.setNumber}</Text>
                    </Pressable>
                    <TextInput style={cell} value={d.weight} onChangeText={(t) => patchDraft(perf.id, set.setNumber, d, { weight: t })} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textTertiary} />
                    <TextInput style={cell} value={d.reps} onChangeText={(t) => patchDraft(perf.id, set.setNumber, d, { reps: t })} keyboardType="number-pad" placeholder="—" placeholderTextColor={colors.textTertiary} />
                    <TextInput style={cell} value={d.rpe} onChangeText={(t) => patchDraft(perf.id, set.setNumber, d, { rpe: t })} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textTertiary} />
                    <Pressable onPress={() => completeSet(perf, set.setNumber, !done)} style={{ width: 44, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: done ? colors.lime : colors.surface }}>
                      <Ionicons name="checkmark" size={20} color={done ? "#1a1a1a" : colors.textTertiary} />
                    </Pressable>
                  </View>
                );
              })}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Chip label="+ Set" onPress={() => addSet(perf)} />
                <Chip label="+ Warm-up" onPress={() => { const n = Math.max(0, ...perf.sets.map((s) => s.setNumber)) + 1; void completeSet(perf, n, false, true); }} />
              </View>
            </Card>
          ))}
        </View>

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button label="Add exercise" variant="ghost" onPress={() => setAdding(true)} />
          <Button label="Finish workout" variant="accent" loading={finishing} onPress={confirmFinish} />
        </View>
      </Screen>

      <ExercisePicker visible={adding} onClose={() => setAdding(false)} onPick={addExercise} />
      <SwapSheet perf={swapFor} onClose={() => setSwapFor(null)} onPick={(slug) => swapFor && swap(swapFor, slug)} />
      <PlateSheet total={plateFor} units={units} onClose={() => setPlateFor(null)} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <Label>{label}</Label>
      <Num size={22}>{value}</Num>
    </View>
  );
}

export function ExercisePicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (e: Exercise) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Exercise[]>([]);
  const [busy, setBusy] = useState(false);
  const run = useCallback((text: string) => {
    setBusy(true);
    api.library.exercises({ q: text || undefined, take: 30 }).then((r) => setItems(r.items)).catch(() => {}).finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => run(q), 250);
    return () => clearTimeout(t);
  }, [q, visible, run]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Add exercise">
      <TextInput value={q} onChangeText={setQ} placeholder="Search exercises" placeholderTextColor={colors.textTertiary} autoCapitalize="none" style={{ height: 48, borderRadius: radius.small, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 }} />
      {busy && !items.length ? <Text color="tertiary">Searching…</Text> : null}
      {items.map((e) => (
        <Pressable key={e.id} onPress={() => onPick(e)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
          <Text>{e.name}</Text>
          <Text variant="meta" color="tertiary">{[e.category, ...e.equipment].join(" · ")}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

function SwapSheet({ perf, onClose, onPick }: { perf: ExercisePerformance | null; onClose: () => void; onPick: (slug: string) => void }) {
  const [items, setItems] = useState<SwapSuggestion[] | null>(null);
  useEffect(() => {
    if (!perf) return;
    setItems(null);
    api.workouts.swapSuggestions({ exerciseSlug: perf.exercise.slug }).then((r) => setItems(r.recommended.length ? r.recommended : r.all)).catch(() => setItems([]));
  }, [perf]);
  return (
    <Sheet visible={!!perf} onClose={onClose} title={perf ? `Swap ${perf.exercise.name}` : ""}>
      {items === null ? <Text color="tertiary">Finding alternatives…</Text> : items.length === 0 ? <Text color="secondary">No alternatives found.</Text> : null}
      {items?.map((s) => (
        <Pressable key={s.slug} onPress={() => onPick(s.slug)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 2 }}>
          <Text>{s.name}</Text>
          <Text variant="meta" color="tertiary">{s.rationale ?? s.reasons.join(" · ")}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

function PlateSheet({ total, units, onClose }: { total: number | null; units: Units; onClose: () => void }) {
  const u = units === "metric" ? "kg" : "lb";
  const [bar, setBar] = useState(units === "metric" ? 20 : 45);
  const res = total ? plateCombo(total, bar, u) : null;
  return (
    <Sheet visible={total != null} onClose={onClose} title="Plate calculator">
      <Text color="secondary">Target {total} {u}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(units === "metric" ? [15, 20] : [35, 45]).map((b) => <Chip key={b} label={`${b} ${u} bar`} active={bar === b} onPress={() => setBar(b)} />)}
      </View>
      {res ? (
        <>
          <Num size={26}>{plateLabel(res.perSide)}</Num>
          <Text variant="meta" color="tertiary">Per side · loaded {res.loaded} {u}{res.remainder ? ` · ${res.remainder} ${u} left over` : ""}</Text>
        </>
      ) : null}
    </Sheet>
  );
}
