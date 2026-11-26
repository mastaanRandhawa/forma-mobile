/**
 * Train — Today (the planned workout is the hero; Quick start sits beside it),
 * History (calendar + scannable session list) and Templates (yours, then
 * prebuilt). Create lives in the header. Every start goes through the daily
 * check-in gate when the user asked to be prompted before their first workout.
 */
import { useMemo, useState } from "react";
import { Alert, Pressable, Share, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useMuscleBalance, usePlannedWorkouts, useResource, useSessionHistory, useWorkoutTemplates } from "@/api/hooks";
import { useProgression } from "@/api/settings";
import { useAuth } from "@/auth/auth-provider";
import type { Program, WorkoutSession } from "@/api/types";
import { CATEGORY_LABEL, WORKOUT_TEMPLATES, recommendTemplates, templateExerciseTarget, type Difficulty, type TemplateCategory } from "@/lib/workout-templates";
import { GOAL_LABELS } from "@/lib/profile-options";
import { supersetLetter } from "@/lib/active-session";
import { shareText, deleteTemplate, duplicateTemplate, fmtDuration, fromKg, presetToRow, renameTemplate, saveSessionAsTemplate, startFromRow, startQuick, startRepeat, unitLabel, workoutToRow, type TemplateRow, type Units } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { HIT, colors, fonts, iconSize, radius } from "@/theme/tokens";
import { useCheckinGate } from "@/components/checkin";
import { useDevicePrefs } from "@/lib/device-prefs";
import { useActiveSession } from "@/components/workout-bar";
import { Pinned, Screen } from "@/components/ui/screen";
import { Button, Chip, SectionHeading } from "@/components/ui/controls";
import { FadeSwap, ListFooter, SkelRows, useGrowingList, useIncremental } from "@/components/ui/loading";
import { TourTarget } from "@/components/tour/tour";
import { ActionMenu, Card, EmptyState, ErrorState, PillTabs, Segmented, Sheet, Skel, type MenuAction } from "@/components/ui/extra";
import { ExerciseThumb } from "@/components/exercise";
import { PopoverMenu } from "@/components/ui/popover";
import { ProfileMenu } from "@/components/profile-menu";
import { Quiet } from "@/components/quiet";
import { Fill } from "@/components/ui/gradient";
import { PressScale } from "@/components/ui/pressable";
import { toast } from "@/components/ui/toast";
import { Label, Num, Text } from "@/components/ui/text";

const TABS = [
  { value: "today", label: "Today" },
  { value: "history", label: "History" },
  { value: "templates", label: "Templates" },
] as const;
type Tab = (typeof TABS)[number]["value"];
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const DIFFS: (Difficulty | "all")[] = ["all", "beginner", "intermediate", "advanced"];
const prCount = (s: WorkoutSession) => s.personalRecords?.length ?? s.performances.reduce((n, p) => n + p.sets.filter((x) => x.isPersonalRecord).length, 0);

export default function Workouts() {
  useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const prog = useProgression();
  const units: Units = user?.unitPreference ?? "imperial";
  const u = unitLabel(units);
  const [tab, setTab] = useState<Tab>("today");
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<TemplateRow | null>(null);
  const [detail, setDetail] = useState<WorkoutSession | null>(null);
  const [menu, setMenu] = useState<{ title: string; actions: MenuAction[] } | null>(null);
  const [renaming, setRenaming] = useState<TemplateRow | null>(null);
  const [editing, setEditing] = useState<WorkoutSession | null>(null);
  const [programsOpen, setProgramsOpen] = useState(false);
  const [category, setCategory] = useState<TemplateCategory | "all">("all");
  const [diff, setDiff] = useState<Difficulty | "all">("all");
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState<number | null>(null);
  const { gate, element: checkinGate } = useCheckinGate();
  const device = useDevicePrefs();

  const planned = usePlannedWorkouts();
  const templates = useWorkoutTemplates();
  const history = useSessionHistory();
  const balance = useMuscleBalance();
  const programs = useResource<Program[]>("programs-list", () => api.programs.list());
  const active = useActiveSession();

  const activeProgram = programs.data?.find((p) => p.active) ?? null;
  const week = useMemo(() => {
    if (!activeProgram) return null;
    const idx = Math.max(0, Math.floor((Date.now() - new Date(activeProgram.createdAt).getTime()) / (7 * 864e5)));
    const current = Math.min(idx + 1, activeProgram.durationWeeks);
    return { current, total: activeProgram.durationWeeks, deload: activeProgram.durationWeeks >= 4 && current % 4 === 0, name: activeProgram.name };
  }, [activeProgram]);

  const today = (planned.data ?? []).find((w) => !w.scheduledDate || new Date(w.scheduledDate).toDateString() === new Date().toDateString()) ?? planned.data?.[0] ?? null;
  const rows = useMemo(() => (templates.data ?? []).map(workoutToRow), [templates.data]);
  // long lists load a page at a time as you scroll
  const pagedHist = useGrowingList<WorkoutSession>("session-history-pg", (take) => api.sessions.list({ status: "completed", take }), 20);
  const myPaged = useIncremental(rows, 8);
  const recommended = useMemo(
    () => recommendTemplates({ goal: user?.fitnessGoal ? GOAL_LABELS[user.fitnessGoal].toLowerCase() : null, experience: user?.experienceLevel ?? null, environment: user?.trainingLocation ?? null, equipment: [] }, [], 3).map(presetToRow),
    [user],
  );
  const sessions = useMemo(() => history.data ?? [], [history.data]);

  const refreshAll = async () => {
    invalidateResource();
    await Promise.all([planned, templates, history, active, programs].map((r) => r.reload()).concat(pagedHist.reload()));
  };

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(null);
    }
  };
  const deleteSession = (sess: WorkoutSession) =>
    Alert.alert("Delete this workout?", `"${sess.name}" and any records it set will be removed. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run("del-session", async () => { await api.sessions.remove(sess.id); setDetail(null); await refreshAll(); toast.success("Workout deleted"); }) },
    ]);
  const removeExercise = (sess: WorkoutSession, perfId: string, name: string) =>
    Alert.alert(`Remove ${name}?`, "Its sets leave this workout and your records are re-read.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void run("del-perf", async () => { await api.sessions.removePerformance(sess.id, perfId); const fresh = await api.sessions.get(sess.id); setDetail(fresh); await refreshAll(); }) },
    ]);
  const openActive = () => {
    invalidateResource("active-session");
    router.push("/workout/active");
  };
  /** Guard: one session at a time. */
  const startGuarded = (key: string, fn: () => Promise<unknown>) => {
    if (active.data) {
      Alert.alert("Workout in progress", `Finish or discard "${active.data.name}" before starting another.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Resume it", onPress: openActive },
      ]);
      return;
    }
    gate(() => void run(key, async () => { await fn(); openActive(); }));
  };

  const startRow = (row: TemplateRow) => startGuarded(`start:${row.id}`, async () => { setPreview(null); await startFromRow(row); });
  const quick = () => startGuarded("quick", () => startQuick());
  const repeat = (s: WorkoutSession) => startGuarded(`repeat:${s.id}`, async () => { setDetail(null); await startRepeat(s); });
  const generate = () =>
    startGuarded("gen", async () => {
      const focus = (balance.data?.undertrained ?? []).slice(0, 3).map((m) => m.key);
      const w = (await api.workouts.generate({ focus: focus.length ? focus : ["chest", "back", "quads"], durationMin: user?.sessionLengthTargetMin ?? 45, save: true })) as { id?: string };
      planned.refetch();
      if (!w?.id) throw new Error("Couldn't generate a workout. Try a template instead.");
      await api.sessions.start({ workoutId: w.id });
    });

  const afterTemplates = () => {
    invalidateResource("workout-templates");
    templates.refetch();
  };
  const saveCopy = (row: TemplateRow) => run(`copy:${row.id}`, async () => { await duplicateTemplate(row); afterTemplates(); toast.success("Saved to My templates", { label: "View", onPress: () => setTab("templates") }); });
  const confirmDelete = (row: TemplateRow) =>
    Alert.alert("Delete template?", `"${row.name}" will be removed. This can't be undone.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => run(`del:${row.id}`, async () => { await deleteTemplate(row.id); afterTemplates(); setPreview(null); toast.success("Template deleted"); }) },
    ]);
  const openMenu = (row: TemplateRow) =>
    setMenu({
      title: row.name,
      actions:
        row.origin === "preset"
          ? [
              { label: "Start workout", icon: "play-outline", onPress: () => startRow(row) },
              { label: "Customize", icon: "create-outline", hint: "Edit a copy in the builder", onPress: () => router.push({ pathname: "/workout/builder", params: { from: row.id } }) },
              { label: "Save a copy", icon: "copy-outline", onPress: () => saveCopy(row) },
              { label: "Share", icon: "share-outline", hint: "Send this routine as text", onPress: () => void Share.share({ message: shareText(row) }) },
            ]
          : [
              { label: "Start workout", icon: "play-outline", onPress: () => startRow(row) },
              { label: "Edit", icon: "create-outline", onPress: () => router.push({ pathname: "/workout/builder", params: { id: row.id } }) },
              { label: "Duplicate", icon: "copy-outline", onPress: () => run(`dup:${row.id}`, async () => { await duplicateTemplate(row); afterTemplates(); toast.success("Duplicated"); }) },
              { label: "Rename", icon: "text-outline", onPress: () => setRenaming(row) },
              { label: "Share", icon: "share-outline", hint: "Send this routine as text", onPress: () => void Share.share({ message: shareText(row) }) },
              { label: "Delete", icon: "trash-outline", destructive: true, onPress: () => confirmDelete(row) },
            ],
    });

  // calendar
  const cal = useMemo(() => {
    const y = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const byDay = new Map<number, WorkoutSession[]>();
    for (const s of sessions) {
      const d = new Date(s.startedAt);
      if (d.getFullYear() === y && d.getMonth() === m) byDay.set(d.getDate(), [...(byDay.get(d.getDate()) ?? []), s]);
    }
    const planDays = new Set((planned.data ?? []).filter((w) => w.scheduledDate).map((w) => new Date(w.scheduledDate!)).filter((d) => d.getFullYear() === y && d.getMonth() === m).map((d) => d.getDate()));
    const todayD = new Date();
    return {
      byDay,
      cells: Array.from({ length: 42 }, (_, i) => {
        const dd = i - first + 1;
        const inMonth = dd >= 1 && dd <= dim;
        const future = new Date(y, m, dd) >= new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate());
        const preferred = future && device.preferredDays.includes(new Date(y, m, dd).getDay());
        return { day: dd, inMonth, isToday: inMonth && todayD.getFullYear() === y && todayD.getMonth() === m && todayD.getDate() === dd, status: !inMonth ? null : byDay.has(dd) ? "done" : planDays.has(dd) || preferred ? "planned" : null };
      }).filter((c, i) => i < 35 || c.inMonth),
      count: [...byDay.values()].reduce((n, l) => n + l.length, 0),
    };
  }, [sessions, planned.data, month, device.preferredDays]);

  const filteredPresets = WORKOUT_TEMPLATES.filter((t) => (category === "all" || t.category === category) && (diff === "all" || t.difficulty === diff));
  const presetPaged = useIncremental(filteredPresets, 8);
  const prior = detail ? sessions.find((s) => s.name === detail.name && Date.parse(s.startedAt) < Date.parse(detail.startedAt)) : null;

  return (
    <Screen tabs onRefresh={refreshAll} onEndReached={tab === "history" ? pagedHist.loadMore : tab === "templates" ? () => { myPaged.loadMore(); presetPaged.loadMore(); } : undefined}>
      <Pinned>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text variant="title">Train</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TourTarget id="train-insights"><PopoverMenu
            accessibilityLabel="Training insights and tools"
            items={[
              ...(prog.has("progress_basic") ? [{ key: "progress", label: "Progress", icon: "stats-chart-outline" as const, hint: "Trends, strength, recovery", onPress: () => router.push("/progress") }] : []),
              ...(prog.has("body_map") ? [{ key: "body", label: "Body map", icon: "body-outline" as const, hint: "Muscle load and balance", onPress: () => router.push("/body") }] : []),
              { key: "records", label: "Records", icon: "trophy-outline" as const, hint: "PRs and achievements", onPress: () => router.push("/records") },
              ...(prog.has("goals") ? [{ key: "goals", label: "Goals", icon: "flag-outline" as const, hint: "Daily and weekly targets", onPress: () => router.push("/goals") }] : []),
              { key: "library", label: "Exercise library", icon: "library-outline" as const, hint: "601 movements", onPress: () => router.push("/exercises") },
            ]}
            trigger={(open) => (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.medium }}>Insights</Text>
                <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.textSecondary} />
              </View>
            )}
          /></TourTarget>
          <TourTarget id="train-create"><Chip label="+ Create" active onPress={() => router.push("/workout/builder")} /></TourTarget>
          <ProfileMenu />
        </View>
      </View>

      <TourTarget id="train-tabs"><Segmented value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t.value, label: t.label }))} /></TourTarget>
      </Pinned>

      {tab === "today" && (
        <View style={{ marginTop: 20, gap: 20 }}>
          {week || (programs.data ?? []).length > 0 ? (
            <Pressable onPress={() => setProgramsOpen(true)} accessibilityRole="button" accessibilityLabel="Manage programs" style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, minHeight: 44, borderRadius: radius.small, backgroundColor: week?.deload ? "rgba(131,233,244,0.10)" : colors.surface }}>
              <Ionicons name="calendar-outline" size={iconSize.sm} color={week?.deload ? colors.cyan : colors.textTertiary} />
              <Text variant="meta" color="secondary" style={{ flex: 1 }} numberOfLines={2}>{week ? `${week.name} · week ${week.current}/${week.total}${week.deload ? " · deload week" : week.current < week.total && week.current % 4 === 3 ? " · deload next week" : ""}` : "No active program"}</Text>
              <Text variant="meta" color="pink">Manage</Text>
            </Pressable>
          ) : null}

          {active.data ? (
            <Card variant="hero" style={{ marginBottom: 0 }}>
              <Label style={{ color: colors.pinkSoft }}>WORKOUT IN PROGRESS</Label>
              <Text variant="heading" style={{ marginTop: 6 }}>{active.data.name}</Text>
              <View style={{ marginTop: 14 }}><Button label="Resume workout" onPress={openActive} /></View>
            </Card>
          ) : null}

          <Quiet widgetKey="train-today">
          <Card variant={active.data ? "default" : "hero"} style={{ marginBottom: 0 }}>
            {planned.initialLoading ? (
              <View style={{ gap: 10 }}><Skel h={14} w="40%" /><Skel h={24} w="70%" /><Skel h={54} r={27} /></View>
            ) : planned.error && !planned.data ? (
              <ErrorState message="Couldn't load your plan." onRetry={planned.refetch} />
            ) : today ? (
              <>
                <Label>{today.scheduledDate ? `SCHEDULED · ${fmtDate(today.scheduledDate).toUpperCase()}` : "YOUR PLAN"}</Label>
                <Text variant="heading" style={{ marginTop: 6 }}>{today.name}</Text>
                <Text color="secondary" style={{ marginTop: 2 }}>{[cap(today.targetMuscleKeys.slice(0, 3).join(" · ")), `~${today.estimatedDurationMin ?? user?.sessionLengthTargetMin ?? 45} min`, `${today.exercises.length} exercises`].filter(Boolean).join(" · ")}</Text>
                <View style={{ marginTop: 14, gap: 10 }}>
                  {today.exercises.slice(0, 5).map((e) => (
                    <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <ExerciseThumb uri={e.exercise.imageStartUrl} name={e.exercise.name} size={36} />
                      <Text numberOfLines={1} style={{ flex: 1 }}>{e.exercise.name}</Text>
                      <View style={{ minWidth: 76, alignItems: "flex-end" }}>
                        <Num size={14} color="secondary">{e.targetSets} × {e.targetRepsMin ?? "—"}{e.targetRepsMax && e.targetRepsMax !== e.targetRepsMin ? `–${e.targetRepsMax}` : ""}</Num>
                        {e.targetWeightKg ? <Text variant="meta" color="tertiary">{fromKg(e.targetWeightKg, units)} {u}</Text> : null}
                      </View>
                    </View>
                  ))}
                  {today.exercises.length > 5 ? <Text variant="meta" color="tertiary">+{today.exercises.length - 5} more exercises</Text> : null}
                </View>
                <TourTarget id="train-start" style={{ marginTop: 18 }}>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}><Button label={active.data ? "Resume workout" : "Start workout"} loading={busy === `start:${today.id}`} onPress={() => (active.data ? openActive() : startRow(workoutToRow(today)))} /></View>
                  <Button label="Quick start" variant="secondary" loading={busy === "quick"} onPress={quick} style={{ paddingHorizontal: 18 }} />
                </View>
                </TourTarget>
              </>
            ) : (
              <>
                <Label>TODAY</Label>
                <Text variant="heading" style={{ marginTop: 6 }}>No workout scheduled</Text>
                <Text color="secondary" style={{ marginTop: 2 }}>Generate one tuned to your goal, start empty, or pick a template.</Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
                  <View style={{ flex: 1 }}><Button label="Generate a workout" loading={busy === "gen"} onPress={generate} /></View>
                  <Button label="Quick start" variant="secondary" loading={busy === "quick"} onPress={quick} style={{ paddingHorizontal: 18 }} />
                </View>
                <Button label="Browse templates" variant="text" onPress={() => setTab("templates")} style={{ marginTop: 4 }} />
              </>
            )}
          </Card>
          </Quiet>

          <View>
            <SectionHeading title="Recommended" action="All templates" onAction={() => setTab("templates")} />
            <View style={{ gap: 12 }}>
              {recommended.map((r) => <WorkoutCard key={r.id} row={r} busy={busy === `start:${r.id}`} onPress={() => setPreview(r)} onStart={() => startRow(r)} />)}
            </View>
          </View>

          <View>
            <SectionHeading title="Recent workouts" action="History" onAction={() => setTab("history")} />
            {history.initialLoading ? <Skel h={64} r={24} /> : sessions.length === 0 ? <EmptyState title="No finished sessions yet" body="Completed workouts show up here." /> : (
              <Quiet widgetKey="train-recent"><Card variant="compact" style={{ marginBottom: 0 }}>
                <View style={{ gap: 4 }}>
                  {sessions.slice(0, 4).map((s) => <SessionRow key={s.id} s={s} units={units} onPress={() => setDetail(s)} trailing={<Button label={busy === `repeat:${s.id}` ? "…" : "Repeat"} variant="text" onPress={() => repeat(s)} />} />)}
                </View>
              </Card></Quiet>
            )}
          </View>
        </View>
      )}

      {tab === "history" && (
        <View style={{ marginTop: 20, gap: 20 }}>
          <Card style={{ marginBottom: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <PressScale onPress={() => { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setDay(null); }} hitSlop={6} accessibilityLabel="Previous month" style={{ width: HIT, height: HIT, alignItems: "center", justifyContent: "center" }}><Ionicons name="chevron-back" size={iconSize.md} color={colors.textSecondary} /></PressScale>
              <View style={{ alignItems: "center" }}>
                <Text variant="cardTitle">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
                <Text variant="meta" color="tertiary">{cal.count} session{cal.count === 1 ? "" : "s"}</Text>
              </View>
              <PressScale onPress={() => { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setDay(null); }} disabled={month >= new Date(new Date().getFullYear(), new Date().getMonth() + 2, 1)} hitSlop={6} accessibilityLabel="Next month" style={{ width: HIT, height: HIT, alignItems: "center", justifyContent: "center" }}><Ionicons name="chevron-forward" size={iconSize.md} color={colors.textSecondary} /></PressScale>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 8 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Text key={i} variant="meta" color="tertiary" style={{ flex: 1, textAlign: "center" }}>{d}</Text>)}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {cal.cells.map((c, i) => (
                <View key={i} style={{ width: `${100 / 7}%`, height: 46, alignItems: "center", justifyContent: "center" }}>
                  {c.inMonth ? (
                    <PressScale onPress={() => setDay(day === c.day ? null : c.day)} to={0.9} haptic="select" accessibilityLabel={`${month.toLocaleDateString(undefined, { month: "long" })} ${c.day}${c.status === "done" ? ", trained" : c.status === "planned" ? ", planned" : ""}${c.isToday ? ", today" : ""}`} accessibilityState={{ selected: day === c.day }} hitSlop={3} style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: day === c.day ? 1.5 : c.status === "planned" ? 1 : 0, borderStyle: c.status === "planned" && day !== c.day ? "dashed" : "solid", borderColor: day === c.day ? colors.textPrimary : colors.lineHighlight }}>
                      {c.status === "done" ? <Fill angle={135} stops={[colors.pink, colors.coral]} /> : null}
                      <Text variant="meta" style={{ color: c.status === "done" ? colors.onAccent : c.isToday ? colors.textPrimary : colors.textSecondary, fontFamily: c.isToday ? fonts.bold : fonts.semibold }}>{c.day}</Text>
                      {c.isToday && c.status !== "done" ? <View style={{ position: "absolute", bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.pink }} /> : null}
                    </PressScale>
                  ) : null}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 18, marginTop: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.pink }} /><Text variant="meta" color="tertiary">Trained</Text></View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderStyle: "dashed", borderColor: colors.textTertiary }} /><Text variant="meta" color="tertiary">Planned</Text></View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.pink }} /><Text variant="meta" color="tertiary">Today</Text></View>
            </View>
          </Card>

          {day != null ? (
            <View>
              <SectionHeading title={new Date(month.getFullYear(), month.getMonth(), day).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} />
              {(cal.byDay.get(day) ?? []).length ? (
                <Card variant="compact" style={{ marginBottom: 0 }}><View style={{ gap: 4 }}>{cal.byDay.get(day)!.map((s) => <SessionRow key={s.id} s={s} units={units} onPress={() => setDetail(s)} />)}</View></Card>
              ) : (
                <EmptyState title="No session this day" body="Tap another date to see what you trained." />
              )}
            </View>
          ) : null}

          <View>
            <SectionHeading title="All sessions" />
            <FadeSwap id={pagedHist.initialLoading ? "load" : pagedHist.items.length ? "ready" : "empty"}>
            {pagedHist.initialLoading ? <SkelRows count={5} thumb={40} /> : pagedHist.error && !pagedHist.items.length ? <ErrorState message="Couldn't load history." onRetry={pagedHist.refetch} /> : pagedHist.items.length === 0 ? (
              <EmptyState title="No sessions yet" body="Your finished workouts land here — volume, duration and any PRs." action="Start today's workout" onAction={() => setTab("today")} />
            ) : (
              <Card variant="compact" style={{ marginBottom: 0 }}><View style={{ gap: 4 }}>{pagedHist.items.map((s) => <SessionRow key={s.id} s={s} units={units} onPress={() => setDetail(s)} />)}</View></Card>
            )}
            </FadeSwap>
            <ListFooter loading={pagedHist.loadingMore} done={!pagedHist.hasMore && pagedHist.items.length > 20} label="That's your full history" />
          </View>
        </View>
      )}

      {tab === "templates" && (
        <View style={{ marginTop: 20, gap: 28 }}>
          <View>
            <SectionHeading title={`My templates${rows.length ? ` · ${rows.length}` : ""}`} action={rows.length ? "+ Create" : undefined} onAction={() => router.push("/workout/builder")} />
            {templates.initialLoading ? <Skel h={110} r={24} /> : rows.length === 0 ? (
              <EmptyState title="No templates of your own yet" body="Build one from scratch, or save a copy of a prebuilt workout below." action="Create workout" onAction={() => router.push("/workout/builder")} />
            ) : (
              <View style={{ gap: 12 }}>{myPaged.visible.map((r) => <WorkoutCard key={r.id} row={r} busy={busy === `start:${r.id}`} onPress={() => setPreview(r)} onStart={() => startRow(r)} onMore={() => openMenu(r)} />)}{myPaged.hasMore ? <ListFooter loading /> : null}</View>
            )}
          </View>

          <View>
            <SectionHeading title="Prebuilt workouts" />
            <View style={{ gap: 10, marginBottom: 14 }}>
              <PillTabs bleed value={category} onChange={setCategory} options={[{ value: "all", label: "All" }, ...(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]} />
              <PillTabs bleed value={diff} onChange={setDiff} options={DIFFS.map((d) => ({ value: d, label: d === "all" ? "Any level" : d[0].toUpperCase() + d.slice(1) }))} />
            </View>
            {filteredPresets.length === 0 ? (
              <EmptyState title="Nothing matches those filters" body="Loosen a filter to see more prebuilt workouts." action="Clear filters" onAction={() => { setCategory("all"); setDiff("all"); }} />
            ) : (
              <View style={{ gap: 12 }}>{presetPaged.visible.map((t) => <WorkoutCard key={t.id} row={presetToRow(t)} difficulty={t.difficulty} busy={busy === `start:${t.id}`} onPress={() => setPreview(presetToRow(t))} onStart={() => startRow(presetToRow(t))} onMore={() => openMenu(presetToRow(t))} />)}{presetPaged.hasMore ? <ListFooter loading /> : null}</View>
            )}
            <Text variant="meta" color="tertiary" style={{ textAlign: "center", marginTop: 16 }}>Prebuilt workouts are starting points — save a copy to make one your own.</Text>
          </View>
        </View>
      )}

      <Sheet
        visible={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.name}
        eyebrow={preview ? `~${preview.durationMin} min · ${preview.exerciseCount} exercises` : undefined}
        footer={preview ? (
          <>
            <Button label="Start workout" variant="accent" loading={busy === `start:${preview.id}`} onPress={() => startRow(preview)} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><Button label={preview.editable ? "Edit" : "Customize"} variant="ghost" onPress={() => { const p = preview; setPreview(null); router.push({ pathname: "/workout/builder", params: p.editable ? { id: p.id } : { from: p.id } }); }} /></View>
              <View style={{ flex: 1 }}><Button label={preview.origin === "preset" ? "Save a copy" : "More"} variant="ghost" loading={busy === `copy:${preview.id}`} onPress={() => (preview.origin === "preset" ? saveCopy(preview) : openMenu(preview))} /></View>
            </View>
          </>
        ) : undefined}
      >
        {preview ? (
          <>
            {preview.description ? <Text color="secondary">{preview.description}</Text> : null}
            {preview.targetMuscles.length ? <Text variant="meta" color="tertiary">{preview.targetMuscles.join(" · ")}</Text> : null}
            {preview.exercises.map((e, i) => {
              const head = e.supersetGroup != null && preview.exercises[i - 1]?.supersetGroup !== e.supersetGroup;
              return (
                <View key={i}>
                  {head ? <Label style={{ color: colors.mauve, marginTop: 4 }}>SUPERSET {supersetLetter(e.supersetGroup!)}</Label> : null}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 10 }}>
                    <ExerciseThumb name={e.name} size={30} />
                    <Text style={{ flex: 1 }} numberOfLines={2}>{e.name}</Text>
                    <Text variant="meta" color="tertiary">{templateExerciseTarget(e)} · {e.restSec}s</Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}
      </Sheet>

      <Sheet
        visible={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name}
        eyebrow={detail ? fmtDate(detail.startedAt) : undefined}
        footer={detail ? (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Repeat" variant="accent" loading={busy === `repeat:${detail.id}`} onPress={() => repeat(detail)} /></View>
              <View style={{ flex: 1 }}><Button label="Save as template" variant="ghost" loading={busy === "save"} onPress={() => run("save", async () => { await saveSessionAsTemplate(detail); afterTemplates(); toast.success("Saved to My templates"); })} /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><Button label="Edit details" variant="ghost" onPress={() => setEditing(detail)} /></View>
              <View style={{ flex: 1 }}><Button label="Delete" variant="text" loading={busy === "del-session"} onPress={() => deleteSession(detail)} /></View>
            </View>
          </>
        ) : undefined}
      >
        {detail ? (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[["TIME", fmtDuration(detail.durationSeconds)], [`VOLUME · ${u.toUpperCase()}`, Math.round(fromKg(detail.totalVolumeKg, units)).toLocaleString()], ["PRS", String(prCount(detail))]].map(([l, v]) => (
                <View key={l} style={{ flex: 1, padding: 12, borderRadius: radius.small, backgroundColor: colors.surface, gap: 4 }}><Num size={18}>{v}</Num><Label>{l}</Label></View>
              ))}
            </View>
            {prior ? (
              <Text variant="meta" color="secondary">
                vs {fmtDate(prior.startedAt)}: <Text variant="meta" style={{ color: detail.totalVolumeKg >= prior.totalVolumeKg ? colors.lime : colors.amber }}>{detail.totalVolumeKg >= prior.totalVolumeKg ? "+" : ""}{Math.round(fromKg(detail.totalVolumeKg - prior.totalVolumeKg, units)).toLocaleString()} {u}</Text> volume · {Math.round((detail.durationSeconds - prior.durationSeconds) / 60)} min
              </Text>
            ) : null}
            {detail.trainerComment ? <View style={{ padding: 12, borderRadius: radius.small, backgroundColor: colors.surface, gap: 4 }}><Label>FROM YOUR TRAINER</Label><Text color="secondary">{detail.trainerComment}</Text></View> : null}
            {detail.performances.map((p) => {
              const done = p.sets.filter((s) => s.completedAt);
              return (
                <View key={p.id} style={{ gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ flex: 1 }}>{p.exercise.name}</Text>
                    <Button label="Remove" variant="text" onPress={() => removeExercise(detail, p.id, p.exercise.name)} />
                  </View>
                  <Text variant="meta" color="tertiary">{done.map((s) => `${s.isWarmup ? "w " : ""}${s.weightKg != null ? fromKg(s.weightKg, units) : "BW"}×${s.reps ?? "—"}${s.isPersonalRecord ? " ★" : ""}`).join("   ") || "No sets logged"}</Text>
                </View>
              );
            })}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={programsOpen} onClose={() => setProgramsOpen(false)} title="Programs" eyebrow="Multi-week plans">
        {(programs.data ?? []).length === 0 ? <Text color="secondary">No programs yet. Ask your trainer to build one.</Text> : (programs.data ?? []).map((p) => (
          <View key={p.id} style={{ gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2}>{p.name}</Text>
                <Text variant="meta" color="tertiary">{p.durationWeeks} weeks{p.active ? " · active" : ""}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {!p.active ? <View style={{ flex: 1 }}><Button label="Make active" variant="ghost" loading={busy === `activate:${p.id}`} onPress={() => run(`activate:${p.id}`, async () => { await api.programs.activate(p.id); await programs.reload(); invalidateResource("dashboard"); toast.success(`${p.name} is now active`); })} /></View> : null}
              <View style={{ flex: 1 }}><Button label="Delete" variant="text" loading={busy === `delprog:${p.id}`} onPress={() => Alert.alert("Delete this program?", `"${p.name}" and its schedule are removed. Finished workouts stay in your history.`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void run(`delprog:${p.id}`, async () => { await api.programs.remove(p.id); await programs.reload(); invalidateResource("dashboard"); toast.success("Program deleted"); }) }])} /></View>
            </View>
          </View>
        ))}
      </Sheet>

      <EditSessionSheet
        session={editing}
        onClose={() => setEditing(null)}
        onSave={(body) => editing && run("edit-session", async () => { const updated = await api.sessions.update(editing.id, body); setEditing(null); setDetail(updated); await refreshAll(); toast.success("Workout updated"); })}
      />

      <ActionMenu visible={!!menu} onClose={() => setMenu(null)} title={menu?.title} actions={menu?.actions ?? []} />
      <RenameSheet row={renaming} onClose={() => setRenaming(null)} onSave={(name) => renaming && run(`rename:${renaming.id}`, async () => { await renameTemplate(renaming.id, name); afterTemplates(); setRenaming(null); toast.success("Renamed"); })} />
      {checkinGate}
    </Screen>
  );
}

const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * WorkoutCard — one size for every recommended / personal / prebuilt workout:
 * name (+ level), a one-line description, primary muscle groups, then duration,
 * exercise count and a single Start action. Tap opens the full detail; long-press
 * (when `onMore` is given) opens the template actions.
 */
function WorkoutCard({ row, onPress, onStart, onMore, difficulty, busy }: { row: TemplateRow; onPress: () => void; onStart: () => void; onMore?: () => void; difficulty?: Difficulty; busy?: boolean }) {
  const muscles = row.targetMuscles.slice(0, 3).map(cap).join(" · ");
  return (
    <PressScale onPress={onPress} onLongPress={onMore} delayLongPress={300} to={0.985} accessibilityRole="none" accessibilityLabel={`${row.name}, ${row.durationMin} minutes, ${row.exerciseCount} exercises`} accessibilityHint={onMore ? "Long-press for more actions" : undefined}>
      <Card variant="compact" style={{ marginBottom: 0, minHeight: 148 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>{row.name}</Text>
          {difficulty ? <Label>{difficulty.toUpperCase()}</Label> : null}
        </View>
        <Text color="secondary" numberOfLines={1} style={{ marginTop: 3 }}>{row.description || muscles || " "}</Text>
        {row.description && muscles ? <Text variant="meta" color="tertiary" numberOfLines={1} style={{ marginTop: 6 }}>{muscles}</Text> : <View style={{ height: 17 + 6 }} />}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Ionicons name="time-outline" size={iconSize.sm} color={colors.textTertiary} /><Text variant="meta" color="secondary">{row.durationMin} min</Text></View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Ionicons name="barbell-outline" size={iconSize.sm} color={colors.textTertiary} /><Text variant="meta" color="secondary">{row.exerciseCount} exercises</Text></View>
          </View>
          <Button label="Start" size="sm" variant="secondary" loading={busy} onPress={onStart} style={{ paddingHorizontal: 22 }} />
        </View>
      </Card>
    </PressScale>
  );
}

/** One finished session as a flat row (date block, name + facts, volume + PRs) — rows live inside a single card. */
function SessionRow({ s, units, onPress, trailing }: { s: WorkoutSession; units: Units; onPress: () => void; trailing?: React.ReactNode }) {
  const prs = prCount(s);
  const d = new Date(s.startedAt);
  return (
    <PressScale onPress={onPress} to={0.985} accessibilityRole={trailing ? "none" : "button"} accessibilityLabel={`${s.name}, ${fmtDate(s.startedAt)}`} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingVertical: 4 }}>
      <View style={{ width: 40, alignItems: "center" }}>
        <Num size={20}>{d.getDate()}</Num>
        <Text variant="meta" color="tertiary">{d.toLocaleDateString(undefined, { month: "short" })}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{s.name}</Text>
        <Text variant="meta" color="tertiary" numberOfLines={1}>{fmtDuration(s.durationSeconds)} · {s.performances.length} exercises{prs ? ` · ${prs} PR${prs > 1 ? "s" : ""}` : ""}</Text>
      </View>
      {trailing ?? (
        <View style={{ alignItems: "flex-end" }}>
          <Num size={15}>{Math.round(fromKg(s.totalVolumeKg, units)).toLocaleString()}</Num>
          <Text variant="meta" color="tertiary">{unitLabel(units)}</Text>
        </View>
      )}
    </PressScale>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Fix a finished workout's name, day and length. Records are re-read by the server. */
function EditSessionSheet({ session, onClose, onSave }: { session: WorkoutSession | null; onClose: () => void; onSave: (b: { name?: string; startedAt?: string; durationSeconds?: number }) => void }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [mins, setMins] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  if (session && session.id !== lastId) {
    setLastId(session.id);
    setName(session.name);
    setDate(ymd(new Date(session.startedAt)));
    setMins(String(Math.round(session.durationSeconds / 60)));
  }
  const m = Number(mins);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
  const minsOk = mins.trim() !== "" && Number.isFinite(m) && m >= 0 && m <= 1440;
  const valid = !!name.trim() && dateOk && minsOk;
  const save = () => {
    if (!session || !valid) return;
    const body: { name?: string; startedAt?: string; durationSeconds?: number } = {};
    if (name.trim() !== session.name) body.name = name.trim();
    if (date !== ymd(new Date(session.startedAt))) {
      // keep the original time of day, move only the day
      const orig = new Date(session.startedAt);
      const [y, mo, d] = date.split("-").map(Number);
      body.startedAt = new Date(y, mo - 1, d, orig.getHours(), orig.getMinutes(), orig.getSeconds()).toISOString();
    }
    if (Math.round(m * 60) !== session.durationSeconds) body.durationSeconds = Math.round(m * 60);
    if (!Object.keys(body).length) return onClose();
    onSave(body);
  };
  const field = { height: 52, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 16, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 17 } as const;
  return (
    <Sheet visible={!!session} onClose={onClose} title="Edit workout" footer={<Button label="Save changes" disabled={!valid} onPress={save} />}>
      <Label>NAME</Label>
      <TextInput value={name} onChangeText={setName} maxLength={120} style={field} />
      <Label>DATE (YYYY-MM-DD)</Label>
      <TextInput value={date} onChangeText={setDate} maxLength={10} autoCapitalize="none" keyboardType="numbers-and-punctuation" style={field} />
      <Label>DURATION (MINUTES)</Label>
      <TextInput value={mins} onChangeText={setMins} maxLength={4} keyboardType="number-pad" style={field} />
      {!dateOk && date ? <Text variant="meta" style={{ color: colors.amber }}>Use a date like 2026-11-20 (not in the future).</Text> : null}
    </Sheet>
  );
}

function RenameSheet({ row, onClose, onSave }: { row: TemplateRow | null; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  if (row && row.id !== lastId) {
    setLastId(row.id);
    setName(row.name);
  }
  return (
    <Sheet visible={!!row} onClose={onClose} title="Rename template" footer={<Button label="Save" disabled={!name.trim() || name.trim() === row?.name} onPress={() => onSave(name.trim())} />}>
      <TextInput autoFocus value={name} onChangeText={setName} maxLength={60} returnKeyType="done" onSubmitEditing={() => name.trim() && onSave(name.trim())} style={{ height: 52, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 16, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 17 }} />
    </Sheet>
  );
}
