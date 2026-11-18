import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/api/client";
import { invalidateResource, usePlannedWorkouts, useResource, useSessionHistory, useWorkoutTemplates } from "@/api/hooks";
import { useProgression } from "@/api/settings";
import { useAuth } from "@/auth/auth-provider";
import type { Program, WorkoutSession } from "@/api/types";
import { CATEGORY_LABEL, WORKOUT_TEMPLATES, recommendTemplates, templateExerciseTarget, type TemplateCategory } from "@/lib/workout-templates";
import { GOAL_LABELS } from "@/lib/profile-options";
import { deleteTemplate, duplicateTemplate, fmtDuration, fromKg, presetToRow, startFromRow, startQuick, startRepeat, unitLabel, workoutToRow, saveSessionAsTemplate, type TemplateRow, type Units } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { colors } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, SectionHeading } from "@/components/ui/controls";
import { Card, EmptyState, Segmented, Sheet } from "@/components/ui/extra";
import { RaisedSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";

const TABS = [
  { value: "today", label: "Today" },
  { value: "calendar", label: "Calendar" },
  { value: "history", label: "History" },
  { value: "templates", label: "Templates" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

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
  const [category, setCategory] = useState<TemplateCategory | "all">("all");

  const planned = usePlannedWorkouts();
  const templates = useWorkoutTemplates();
  const history = useSessionHistory();
  const programs = useResource<Program[]>("programs-list", () => api.programs.list());
  const active = useResource<WorkoutSession | null>("active-session", () => api.sessions.list({ status: "in_progress", take: 1 }).then((l) => l[0] ?? null));

  const activeProgram = programs.data?.find((p) => p.active) ?? null;
  const week = useMemo(() => {
    if (!activeProgram) return null;
    const idx = Math.max(0, Math.floor((Date.now() - new Date(activeProgram.createdAt).getTime()) / (7 * 864e5)));
    const current = Math.min(idx + 1, activeProgram.durationWeeks);
    return { current, total: activeProgram.durationWeeks, deload: activeProgram.durationWeeks >= 4 && current % 4 === 0, name: activeProgram.name };
  }, [activeProgram]);

  const today = planned.data?.[0] ?? null;
  const rows = useMemo(() => (templates.data ?? []).map(workoutToRow), [templates.data]);
  const recommended = useMemo(
    () => recommendTemplates({ goal: user?.fitnessGoal ? GOAL_LABELS[user.fitnessGoal].toLowerCase() : null, experience: user?.experienceLevel ?? null, environment: user?.trainingLocation ?? null, equipment: [] }, [], 3).map(presetToRow),
    [user],
  );

  const refreshAll = () => {
    invalidateResource();
    planned.refetch();
    templates.refetch();
    history.refetch();
    active.refetch();
  };

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      Alert.alert("Something went wrong", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const startRow = (row: TemplateRow) => run(`start:${row.id}`, async () => { await startFromRow(row); setPreview(null); invalidateResource("active-session"); router.push("/workout/active"); });
  const quick = () => run("quick", async () => { await startQuick(); invalidateResource("active-session"); router.push("/workout/active"); });
  const generate = () =>
    run("gen", async () => {
      const w = (await api.workouts.generate({ focus: ["chest", "back", "quads"], durationMin: user?.sessionLengthTargetMin ?? 45, save: true })) as { id?: string };
      planned.refetch();
      if (w?.id) { await api.sessions.start({ workoutId: w.id }); invalidateResource("active-session"); router.push("/workout/active"); }
    });

  const calendar = useMemo(() => {
    const ref = new Date();
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const first = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const trained = new Set((history.data ?? []).map((s) => new Date(s.startedAt)).filter((d) => d.getFullYear() === y && d.getMonth() === m).map((d) => d.getDate()));
    const planDays = new Set((planned.data ?? []).filter((w) => w.scheduledDate).map((w) => new Date(w.scheduledDate!)).filter((d) => d.getFullYear() === y && d.getMonth() === m).map((d) => d.getDate()));
    return Array.from({ length: 42 }, (_, i) => {
      const day = i - first + 1;
      const inMonth = day >= 1 && day <= dim;
      return { day, inMonth, status: !inMonth ? null : trained.has(day) ? "done" : planDays.has(day) ? "planned" : null };
    });
  }, [history.data, planned.data]);

  const filteredPresets = WORKOUT_TEMPLATES.filter((t) => category === "all" || t.category === category);

  return (
    <Screen tabs refreshing={false} onRefresh={refreshAll}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Text variant="title">Training</Text>
        <Chip label="Create" active onPress={() => router.push("/workout/builder")} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
        <Chip label="Workouts" active />
        {prog.has("progress_basic") ? <Chip label="Progress" onPress={() => router.push("/progress")} /> : null}
        {prog.has("body_map") ? <Chip label="Body" onPress={() => router.push("/body")} /> : null}
        <Chip label="Records" onPress={() => router.push("/records")} />
        <Chip label="Exercise library" onPress={() => router.push("/exercises")} />
        {prog.has("goals") ? <Chip label="Goals" onPress={() => router.push("/goals")} /> : null}
      </ScrollView>

      <Segmented value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t.value, label: t.label }))} />

      {tab === "today" && (
        <View style={{ marginTop: 16, gap: 14 }}>
          {week ? (
            <Card style={{ marginBottom: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="calendar-outline" size={16} color={week.deload ? colors.cyan : colors.textTertiary} />
                <Text style={{ flex: 1 }}>{week.name} · week {week.current}/{week.total}{week.deload ? " · deload week" : week.current < week.total && week.current % 4 === 3 ? " · deload next week" : ""}</Text>
              </View>
            </Card>
          ) : null}

          {active.data ? (
            <RaisedSurface radiusSize="large" style={{ padding: 18, gap: 8 }}>
              <Label>WORKOUT IN PROGRESS</Label>
              <Text variant="heading">{active.data.name}</Text>
              <Button label="Resume workout" variant="accent" onPress={() => router.push("/workout/active")} />
            </RaisedSurface>
          ) : null}

          <RaisedSurface radiusSize="large" style={{ padding: 18, gap: 10 }}>
            <Label>TODAY</Label>
            {today ? (
              <>
                <Text variant="heading">{today.name}</Text>
                <Text color="secondary">{today.exercises.length} exercises{today.estimatedDurationMin ? ` · ${today.estimatedDurationMin} min` : ""}</Text>
                {today.exercises.slice(0, 5).map((e) => <Text key={e.id} variant="meta" color="tertiary">{e.exercise.name} · {e.targetSets} × {e.targetRepsMin ?? "—"}{e.targetRepsMax && e.targetRepsMax !== e.targetRepsMin ? `–${e.targetRepsMax}` : ""}</Text>)}
                <Button label="Start workout" variant="accent" loading={busy === `start:${today.id}`} onPress={() => startRow(workoutToRow(today))} />
              </>
            ) : (
              <>
                <Text variant="heading">Nothing planned</Text>
                <Text color="secondary">Let your trainer build today's session, or start from a template.</Text>
                <Button label="Generate with AI" variant="accent" loading={busy === "gen"} onPress={generate} />
              </>
            )}
            <Button label="Quick workout" variant="ghost" loading={busy === "quick"} onPress={quick} />
          </RaisedSurface>

          <SectionHeading title="Recommended" action="All templates" onAction={() => setTab("templates")} />
          {recommended.map((r) => (
            <TemplateCard key={r.id} row={r} onPress={() => setPreview(r)} />
          ))}
        </View>
      )}

      {tab === "calendar" && (
        <Card style={{ marginTop: 16 }} title={new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}>
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Text key={i} variant="meta" color="tertiary" style={{ flex: 1, textAlign: "center" }}>{d}</Text>)}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {calendar.map((c, i) => (
              <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                {c.inMonth ? (
                  <View style={{ flex: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.status === "done" ? colors.pink : "transparent", borderWidth: c.status === "planned" ? 1 : 0, borderColor: colors.lineHighlight }}>
                    <Text variant="meta" style={{ color: c.status === "done" ? colors.onColor : colors.textSecondary }}>{c.day}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      )}

      {tab === "history" && (
        <View style={{ marginTop: 16, gap: 10 }}>
          {(history.data ?? []).length === 0 ? (
            <EmptyState title="No sessions yet" body="Finished workouts show up here." />
          ) : (
            history.data!.map((s) => (
              <Card key={s.id} style={{ marginBottom: 0 }}>
                <Pressable onPress={() => setDetail(s)} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text variant="heading" style={{ fontSize: 17, flex: 1 }}>{s.name}</Text>
                    <Label>{fmtDate(s.startedAt)}</Label>
                  </View>
                  <View style={{ flexDirection: "row", gap: 18 }}>
                    <Num size={15}>{fmtDuration(s.durationSeconds)}</Num>
                    <Num size={15}>{Math.round(fromKg(s.totalVolumeKg, units)).toLocaleString()} {u}</Num>
                    <Num size={15}>{s.performances.length} ex</Num>
                  </View>
                </Pressable>
              </Card>
            ))
          )}
        </View>
      )}

      {tab === "templates" && (
        <View style={{ marginTop: 16, gap: 10 }}>
          <SectionHeading title="My templates" />
          {rows.length === 0 ? <EmptyState title="No templates yet" body="Build one, or save a finished session as a template." action="Create workout" onAction={() => router.push("/workout/builder")} /> : rows.map((r) => <TemplateCard key={r.id} row={r} onPress={() => setPreview(r)} />)}
          <SectionHeading title="Browse presets" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
            <Chip label="All" active={category === "all"} onPress={() => setCategory("all")} />
            {(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map((c) => <Chip key={c} label={CATEGORY_LABEL[c]} active={category === c} onPress={() => setCategory(c)} />)}
          </ScrollView>
          {filteredPresets.map((t) => <TemplateCard key={t.id} row={presetToRow(t)} onPress={() => setPreview(presetToRow(t))} />)}
        </View>
      )}

      <Sheet visible={!!preview} onClose={() => setPreview(null)} title={preview?.name}>
        {preview ? (
          <>
            {preview.description ? <Text color="secondary">{preview.description}</Text> : null}
            <Text variant="meta" color="tertiary">{preview.exerciseCount} exercises · ~{preview.durationMin} min{preview.targetMuscles.length ? ` · ${preview.targetMuscles.join(", ")}` : ""}</Text>
            {preview.exercises.map((e, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
                <Text style={{ flex: 1 }}>{e.name}</Text>
                <Num size={14} color="secondary">{templateExerciseTarget(e)}</Num>
              </View>
            ))}
            <Button label="Start workout" variant="accent" loading={busy === `start:${preview.id}`} onPress={() => startRow(preview)} />
            <Button label={preview.origin === "preset" ? "Save a copy" : "Duplicate"} variant="ghost" onPress={() => run("dup", async () => { await duplicateTemplate(preview); invalidateResource(); templates.refetch(); setPreview(null); setTab("templates"); })} />
            {preview.editable ? <Button label="Edit" variant="ghost" onPress={() => { setPreview(null); router.push({ pathname: "/workout/builder", params: { id: preview.id } }); }} /> : null}
            {preview.editable ? <Button label="Delete" variant="ghost" onPress={() => Alert.alert("Delete template?", preview.name, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => run("del", async () => { await deleteTemplate(preview.id); invalidateResource(); templates.refetch(); setPreview(null); }) }])} /> : null}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail ? (
          <>
            <Text variant="meta" color="tertiary">{fmtDate(detail.startedAt)} · {fmtDuration(detail.durationSeconds)} · {Math.round(fromKg(detail.totalVolumeKg, units)).toLocaleString()} {u}</Text>
            {detail.trainerComment ? <Text color="secondary">{detail.trainerComment}</Text> : null}
            {detail.performances.map((p) => (
              <View key={p.id} style={{ gap: 4, paddingVertical: 6 }}>
                <Text>{p.exercise.name}</Text>
                <Text variant="meta" color="tertiary">{p.sets.filter((s) => s.completedAt).map((s) => `${s.weightKg != null ? fromKg(s.weightKg, units) : "BW"}×${s.reps ?? "—"}`).join("  ·  ") || "No sets logged"}</Text>
              </View>
            ))}
            <Button label="Repeat workout" variant="accent" onPress={() => run("repeat", async () => { await startRepeat(detail); setDetail(null); invalidateResource("active-session"); router.push("/workout/active"); })} />
            <Button label="Save as template" variant="ghost" onPress={() => run("save", async () => { await saveSessionAsTemplate(detail); invalidateResource(); templates.refetch(); setDetail(null); setTab("templates"); })} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function TemplateCard({ row, onPress }: { row: TemplateRow; onPress: () => void }) {
  return (
    <Card style={{ marginBottom: 0 }}>
      <Pressable onPress={onPress} style={{ gap: 4 }}>
        <Text variant="heading" style={{ fontSize: 17 }}>{row.name}</Text>
        {row.description ? <Text color="secondary" numberOfLines={2}>{row.description}</Text> : null}
        <Text variant="meta" color="tertiary">{row.exerciseCount} exercises · ~{row.durationMin} min{row.targetMuscles.length ? ` · ${row.targetMuscles.slice(0, 3).join(", ")}` : ""}</Text>
      </Pressable>
    </Card>
  );
}
