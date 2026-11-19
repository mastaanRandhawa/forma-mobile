/**
 * Training hub (website: pages/Workouts.tsx) — Today / Calendar / History /
 * Templates. Every start goes through the daily check-in gate when the user
 * asked to be prompted before their first workout.
 */
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
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
import { deleteTemplate, duplicateTemplate, fmtDuration, fromKg, presetToRow, renameTemplate, saveSessionAsTemplate, startFromRow, startQuick, startRepeat, unitLabel, workoutToRow, type TemplateRow, type Units } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { useCheckinGate } from "@/components/checkin";
import { useDevicePrefs } from "@/lib/device-prefs";
import { useActiveSession } from "@/components/workout-bar";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, SectionHeading } from "@/components/ui/controls";
import { ActionMenu, Card, EmptyState, ErrorState, PillTabs, Segmented, Sheet, Skel, type MenuAction } from "@/components/ui/extra";
import { ExerciseThumb } from "@/components/exercise";
import { PopoverMenu } from "@/components/ui/popover";
import { ProfileMenu } from "@/components/profile-menu";
import { RaisedSurface } from "@/components/ui/surface";
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
  const recommended = useMemo(
    () => recommendTemplates({ goal: user?.fitnessGoal ? GOAL_LABELS[user.fitnessGoal].toLowerCase() : null, experience: user?.experienceLevel ?? null, environment: user?.trainingLocation ?? null, equipment: [] }, [], 3).map(presetToRow),
    [user],
  );
  const sessions = useMemo(() => history.data ?? [], [history.data]);

  const refreshAll = () => {
    invalidateResource();
    [planned, templates, history, active, programs].forEach((r) => r.refetch());
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
            ]
          : [
              { label: "Start workout", icon: "play-outline", onPress: () => startRow(row) },
              { label: "Edit", icon: "create-outline", onPress: () => router.push({ pathname: "/workout/builder", params: { id: row.id } }) },
              { label: "Duplicate", icon: "copy-outline", onPress: () => run(`dup:${row.id}`, async () => { await duplicateTemplate(row); afterTemplates(); toast.success("Duplicated"); }) },
              { label: "Rename", icon: "text-outline", onPress: () => setRenaming(row) },
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
  const prior = detail ? sessions.find((s) => s.name === detail.name && Date.parse(s.startedAt) < Date.parse(detail.startedAt)) : null;

  return (
    <Screen tabs refreshing={false} onRefresh={refreshAll}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <Text variant="title">Train</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <PopoverMenu
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
          />
          <Chip label="+ Create" active onPress={() => router.push("/workout/builder")} />
          <ProfileMenu />
        </View>
      </View>

      <Segmented value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t.value, label: t.label }))} />

      {tab === "today" && (
        <View style={{ marginTop: 16, gap: 14 }}>
          {week ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.small, backgroundColor: week.deload ? "rgba(131,233,244,0.10)" : colors.surface }}>
              <Ionicons name="calendar-outline" size={16} color={week.deload ? colors.cyan : colors.textTertiary} />
              <Text style={{ flex: 1 }} numberOfLines={2}>{week.name} · week {week.current}/{week.total}{week.deload ? " · deload week" : week.current < week.total && week.current % 4 === 3 ? " · deload next week" : ""}</Text>
            </View>
          ) : null}

          {active.data ? (
            <RaisedSurface radiusSize="large" style={{ padding: 18, gap: 8 }}>
              <Label style={{ color: colors.pinkSoft }}>WORKOUT IN PROGRESS</Label>
              <Text variant="heading">{active.data.name}</Text>
              <Button label="Resume workout" variant="accent" onPress={openActive} />
            </RaisedSurface>
          ) : null}

          <RaisedSurface radiusSize="large" style={{ padding: 18, gap: 10 }}>
            {planned.initialLoading ? (
              <><Skel h={14} w="40%" /><Skel h={24} w="70%" /><Skel h={54} r={27} /></>
            ) : planned.error && !planned.data ? (
              <ErrorState message="Couldn't load your plan." onRetry={planned.refetch} />
            ) : today ? (
              <>
                <Label>{today.scheduledDate ? `SCHEDULED · ${fmtDate(today.scheduledDate).toUpperCase()}` : "YOUR PLAN"}</Label>
                <Text variant="heading">{today.name}</Text>
                <Text color="secondary">{[today.targetMuscleKeys.join(", ").toLowerCase(), `~${today.estimatedDurationMin ?? user?.sessionLengthTargetMin ?? 45} min`].filter(Boolean).join(" · ")}</Text>
                {today.exercises.slice(0, 6).map((e) => (
                  <View key={e.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <ExerciseThumb uri={e.exercise.imageStartUrl} name={e.exercise.name} size={30} />
                    <Text variant="meta" color="secondary" numberOfLines={1} style={{ flex: 1 }}>{e.exercise.name}</Text>
                    <Text variant="meta" color="tertiary">{e.targetSets} × {e.targetRepsMin ?? "—"}{e.targetRepsMax && e.targetRepsMax !== e.targetRepsMin ? `–${e.targetRepsMax}` : ""}{e.targetWeightKg ? ` · ${fromKg(e.targetWeightKg, units)} ${u}` : ""}</Text>
                  </View>
                ))}
                {today.exercises.length > 6 ? <Text variant="meta" color="tertiary">+{today.exercises.length - 6} more</Text> : null}
                <Button label={active.data ? "Resume workout" : "Start workout"} variant="accent" loading={busy === `start:${today.id}`} onPress={() => (active.data ? openActive() : startRow(workoutToRow(today)))} />
              </>
            ) : (
              <>
                <Label>TODAY</Label>
                <Text variant="heading">No workout scheduled</Text>
                <Text color="secondary">Generate one tuned to your goal, pick a template, or start empty.</Text>
                <Button label="Generate a workout" variant="accent" loading={busy === "gen"} onPress={generate} />
              </>
            )}
          </RaisedSurface>

          <View style={{ flexDirection: "row", gap: 10 }}>
            {[
              { icon: "flash-outline" as const, label: "Quick start", hint: "Add as you go", onPress: quick, key: "quick" },
              { icon: "add-circle-outline" as const, label: "Create", hint: "Build a template", onPress: () => router.push("/workout/builder"), key: "create" },
              { icon: "albums-outline" as const, label: "Templates", hint: `${WORKOUT_TEMPLATES.length} prebuilt + yours`, onPress: () => setTab("templates"), key: "tpl" },
            ].map((h) => (
              <Pressable key={h.key} onPress={h.onPress} disabled={busy === h.key} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, padding: 12, borderRadius: radius.medium, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineSoft, gap: 6, opacity: pressed || busy === h.key ? 0.7 : 1 })}>
                <Ionicons name={h.icon} size={20} color={colors.pinkSoft} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14 }}>{h.label}</Text>
                <Text variant="meta" color="tertiary" numberOfLines={2} style={{ fontSize: 11 }}>{h.hint}</Text>
              </Pressable>
            ))}
          </View>

          <SectionHeading title="For you" action="All templates" onAction={() => setTab("templates")} />
          <Text variant="meta" color="tertiary" style={{ marginTop: -6 }}>Based on your goal and experience.</Text>
          {recommended.map((r) => <TemplateCard key={r.id} row={r} onPress={() => setPreview(r)} onMore={() => openMenu(r)} />)}

          <SectionHeading title="Recent workouts" action="Full history" onAction={() => setTab("history")} />
          {history.initialLoading ? <Skel h={64} r={24} /> : sessions.length === 0 ? <Text color="tertiary">No finished sessions yet.</Text> : (
            sessions.slice(0, 4).map((s) => (
              <Card key={s.id} style={{ marginBottom: 0, padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Pressable onPress={() => setDetail(s)} style={{ flex: 1 }}>
                    <Text numberOfLines={1}>{s.name}</Text>
                    <Text variant="meta" color="tertiary">{fmtDate(s.startedAt)} · {fmtDuration(s.durationSeconds)} · {Math.round(fromKg(s.totalVolumeKg, units)).toLocaleString()} {u}</Text>
                  </Pressable>
                  <Chip label={busy === `repeat:${s.id}` ? "…" : "Repeat"} onPress={() => repeat(s)} />
                </View>
              </Card>
            ))
          )}
        </View>
      )}

      {tab === "history" && (
        <View style={{ marginTop: 16, gap: 12 }}>
          <Card style={{ marginBottom: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Pressable onPress={() => { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setDay(null); }} hitSlop={12} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={20} color={colors.textSecondary} /></Pressable>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: fonts.semibold }}>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
                <Text variant="meta" color="tertiary">{cal.count} session{cal.count === 1 ? "" : "s"}</Text>
              </View>
              <Pressable onPress={() => { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setDay(null); }} disabled={month >= new Date(new Date().getFullYear(), new Date().getMonth() + 2, 1)} hitSlop={12} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={20} color={colors.textSecondary} /></Pressable>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 6 }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Text key={i} variant="meta" color="tertiary" style={{ flex: 1, textAlign: "center" }}>{d}</Text>)}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {cal.cells.map((c, i) => (
                <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                  {c.inMonth ? (
                    <Pressable onPress={() => setDay(day === c.day ? null : c.day)} accessibilityLabel={`${c.day}${c.status === "done" ? ", trained" : c.status === "planned" ? ", planned" : ""}`} style={{ flex: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.status === "done" ? colors.pink : day === c.day ? colors.surfaceFloat : "transparent", borderWidth: c.status === "planned" || c.isToday ? 1 : 0, borderColor: c.isToday ? colors.btnWhite : colors.lineHighlight }}>
                      <Text variant="meta" style={{ color: c.status === "done" ? colors.onColor : colors.textSecondary }}>{c.day}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.pink }} /><Text variant="meta" color="tertiary">Trained</Text></View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: colors.lineHighlight }} /><Text variant="meta" color="tertiary">Planned</Text></View>
            </View>
          </Card>
          {day != null ? (
            (cal.byDay.get(day) ?? []).length ? (
              cal.byDay.get(day)!.map((s) => <SessionRow key={s.id} s={s} units={units} onPress={() => setDetail(s)} />)
            ) : (
              <Text color="tertiary" style={{ textAlign: "center" }}>No session on {new Date(month.getFullYear(), month.getMonth(), day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.</Text>
            )
          ) : <Text variant="meta" color="tertiary" style={{ textAlign: "center" }}>Tap a day to see what you trained.</Text>}
          <SectionHeading title="All sessions" />
          <View style={{ gap: 10 }}>
          {history.initialLoading ? [0, 1, 2].map((i) => <Skel key={i} h={72} r={24} />) : history.error && !history.data ? <ErrorState message="Couldn't load history." onRetry={history.refetch} /> : sessions.length === 0 ? (
            <EmptyState title="No sessions yet" body="Your finished workouts land here — volume, duration and any PRs." action="Start today's workout" onAction={() => setTab("today")} />
          ) : sessions.map((s) => <SessionRow key={s.id} s={s} units={units} onPress={() => setDetail(s)} />)}
          </View>
        </View>
      )}

      {tab === "templates" && (
        <View style={{ marginTop: 16, gap: 10 }}>
          <SectionHeading title="My templates" action="+ Create" onAction={() => router.push("/workout/builder")} />
          {templates.initialLoading ? <Skel h={80} r={24} /> : rows.length === 0 ? <EmptyState title="No templates yet" body="Build one from scratch or save a copy of a prebuilt workout below." action="Create workout" onAction={() => router.push("/workout/builder")} /> : rows.map((r) => <TemplateCard key={r.id} row={r} onPress={() => setPreview(r)} onMore={() => openMenu(r)} />)}
          <SectionHeading title="Prebuilt workouts" />
          <PillTabs value={category} onChange={setCategory} options={[{ value: "all", label: "All" }, ...(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]} />
          <PillTabs value={diff} onChange={setDiff} options={DIFFS.map((d) => ({ value: d, label: d === "all" ? "Any level" : d[0].toUpperCase() + d.slice(1) }))} />
          {filteredPresets.length === 0 ? <Text color="tertiary" style={{ textAlign: "center", paddingVertical: 12 }}>No prebuilt workouts match those filters.</Text> : null}
          {filteredPresets.map((t) => <TemplateCard key={t.id} row={presetToRow(t)} difficulty={t.difficulty} onPress={() => setPreview(presetToRow(t))} onMore={() => openMenu(presetToRow(t))} />)}
          <Text variant="meta" color="tertiary" style={{ textAlign: "center", marginTop: 6 }}>Prebuilt workouts are starting points — save a copy to make one your own.</Text>
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
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Repeat" variant="accent" loading={busy === `repeat:${detail.id}`} onPress={() => repeat(detail)} /></View>
            <View style={{ flex: 1 }}><Button label="Save as template" variant="ghost" loading={busy === "save"} onPress={() => run("save", async () => { await saveSessionAsTemplate(detail); afterTemplates(); toast.success("Saved to My templates"); })} /></View>
          </View>
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
                  <Text>{p.exercise.name}</Text>
                  <Text variant="meta" color="tertiary">{done.map((s) => `${s.isWarmup ? "w " : ""}${s.weightKg != null ? fromKg(s.weightKg, units) : "BW"}×${s.reps ?? "—"}${s.isPersonalRecord ? " ★" : ""}`).join("   ") || "No sets logged"}</Text>
                </View>
              );
            })}
          </>
        ) : null}
      </Sheet>

      <ActionMenu visible={!!menu} onClose={() => setMenu(null)} title={menu?.title} actions={menu?.actions ?? []} />
      <RenameSheet row={renaming} onClose={() => setRenaming(null)} onSave={(name) => renaming && run(`rename:${renaming.id}`, async () => { await renameTemplate(renaming.id, name); afterTemplates(); setRenaming(null); toast.success("Renamed"); })} />
      {checkinGate}
    </Screen>
  );
}

function TemplateCard({ row, onPress, onMore, difficulty }: { row: TemplateRow; onPress: () => void; onMore: () => void; difficulty?: Difficulty }) {
  return (
    <Pressable onPress={onPress} onLongPress={onMore} delayLongPress={300} accessibilityHint="Long-press for more actions">
      <Card style={{ marginBottom: 0, padding: 16 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="heading" style={{ fontSize: 17 }} numberOfLines={1}>{row.name}</Text>
            {row.description ? <Text color="secondary" numberOfLines={2}>{row.description}</Text> : null}
            <Text variant="meta" color="tertiary">{row.exerciseCount} exercises · ~{row.durationMin} min{difficulty ? ` · ${difficulty}` : ""}{row.targetMuscles.length ? ` · ${row.targetMuscles.slice(0, 3).join(", ")}` : ""}</Text>
          </View>
          <Pressable onPress={onMore} hitSlop={12} accessibilityLabel={`More actions for ${row.name}`} style={{ paddingTop: 2 }}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textTertiary} />
          </Pressable>
        </View>
      </Card>
    </Pressable>
  );
}

function SessionRow({ s, units, onPress }: { s: WorkoutSession; units: Units; onPress: () => void }) {
  const prs = prCount(s);
  return (
    <Pressable onPress={onPress}>
      <Card style={{ marginBottom: 0, padding: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 16 }}>{s.name}</Text>
            <Text variant="meta" color="tertiary">{fmtDate(s.startedAt)} · {fmtDuration(s.durationSeconds)} · {s.performances.length} exercises</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Num size={15}>{Math.round(fromKg(s.totalVolumeKg, units)).toLocaleString()} {unitLabel(units)}</Num>
            {prs ? <Text variant="meta" style={{ color: colors.lime }}>{prs} PR{prs > 1 ? "s" : ""}</Text> : null}
          </View>
        </View>
      </Card>
    </Pressable>
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
