/**
 * Workout builder — create / edit a template, or customize a prebuilt preset
 * (website: pages/WorkoutBuilder.tsx). Drafts autosave on-device so leaving
 * mid-edit never loses work; reopening restores them with a "start over" option.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, LayoutAnimation, Platform, Pressable, TextInput, UIManager, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/api/client";
import { errorMessage, invalidateResource } from "@/api/hooks";
import { readRaw, removeKey, writeJSON } from "@/lib/storage";
import { templateById, templateDurationMin, type TemplateExercise } from "@/lib/workout-templates";
import { createTemplate, normalizeSupersets, startFromRow, updateTemplate, workoutToExercises } from "@/lib/workouts";
import { supersetLetter } from "@/lib/active-session";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { ExercisePicker, ExerciseThumb } from "@/components/exercise";
import { Screen } from "@/components/ui/screen";
import { Button, Field } from "@/components/ui/controls";
import { Card, PageHeader, PageSkeleton, Stepper, Toggle } from "@/components/ui/extra";
import { toast } from "@/components/ui/toast";
import { Label, Text } from "@/components/ui/text";

if (Platform.OS === "android") UIManager.setLayoutAnimationEnabledExperimental?.(true);
const animate = () => LayoutAnimation.configureNext(LayoutAnimation.create(220, "easeInEaseOut", "opacity"));

interface Draft {
  name: string;
  description: string;
  exercises: TemplateExercise[];
}
const EMPTY: Draft = { name: "", description: "", exercises: [] };
const draftKey = (id: string) => `forma.builder.${id}`;

export default function WorkoutBuilder() {
  useTheme();
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const draftId = id ?? (from ? `from-${from}` : "new");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [original, setOriginal] = useState<Draft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [restored, setRestored] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState<"save" | "start" | "dup" | null>(null);
  const skipAutosave = useRef(false);

  // load: saved draft → existing template → preset → blank
  useEffect(() => {
    let alive = true;
    (async () => {
      let base: Draft = EMPTY;
      try {
        if (id) {
          const w = await api.workouts.get(id);
          base = { name: w.name, description: w.notes ?? "", exercises: workoutToExercises(w) };
        } else if (from) {
          const p = templateById(from);
          if (p) base = { name: `${p.name} (my copy)`, description: p.description, exercises: p.exercises.map((e) => ({ ...e })) };
        }
      } catch (e) {
        toast.error(errorMessage(e as Error));
      }
      const saved = await readRaw<Draft>(draftKey(draftId));
      if (!alive) return;
      setOriginal(base);
      if (saved && (saved.exercises?.length || saved.name?.trim()) && JSON.stringify(saved) !== JSON.stringify(base)) {
        setDraft(saved);
        setRestored(true);
      } else setDraft(base);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [id, from, draftId]);

  // autosave
  useEffect(() => {
    if (!loaded || skipAutosave.current) return;
    const t = setTimeout(() => writeJSON(draftKey(draftId), draft), 400);
    return () => clearTimeout(t);
  }, [draft, draftId, loaded]);

  const dirty = loaded && JSON.stringify(draft) !== JSON.stringify(original);
  const duration = templateDurationMin(draft.exercises);
  const canSave = draft.name.trim().length > 0 && draft.exercises.length > 0;

  const patchEx = (i: number, p: Partial<TemplateExercise>) => setDraft((d) => ({ ...d, exercises: d.exercises.map((e, k) => (k === i ? { ...e, ...p } : e)) }));
  const move = (i: number, dir: -1 | 1) => {
    animate();
    setDraft((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.exercises.length) return d;
      const next = [...d.exercises];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, exercises: normalizeSupersets(next) };
    });
    setExpanded((e) => (e === i ? i + dir : e));
    Haptics.selectionAsync().catch(() => {});
  };
  const remove = (i: number) => {
    animate();
    const removed = draft.exercises[i];
    setDraft((d) => ({ ...d, exercises: normalizeSupersets(d.exercises.filter((_, k) => k !== i)) }));
    setExpanded(null);
    toast.info(`${removed.name} removed`, { label: "Undo", onPress: () => setDraft((d) => ({ ...d, exercises: normalizeSupersets([...d.exercises.slice(0, i), removed, ...d.exercises.slice(i)]) })) });
  };
  const duplicate = (i: number) => {
    animate();
    setDraft((d) => ({ ...d, exercises: normalizeSupersets([...d.exercises.slice(0, i + 1), { ...d.exercises[i], supersetGroup: undefined }, ...d.exercises.slice(i + 1)]) }));
  };
  const linked = (i: number) => i > 0 && draft.exercises[i].supersetGroup != null && draft.exercises[i].supersetGroup === draft.exercises[i - 1].supersetGroup;
  const toggleLink = (i: number) => {
    animate();
    Haptics.selectionAsync().catch(() => {});
    setDraft((d) => {
      const exs = d.exercises.map((e) => ({ ...e }));
      if (linked(i)) {
        // unlink: split the group at this boundary; singletons drop out in normalize
        const g = exs[i].supersetGroup;
        for (let k = i; k < exs.length && exs[k].supersetGroup === g; k++) exs[k].supersetGroup = 10_000 + i;
      } else {
        const g = exs[i - 1].supersetGroup ?? -1 - i;
        exs[i - 1].supersetGroup = g;
        exs[i].supersetGroup = g;
      }
      return { ...d, exercises: normalizeSupersets(exs) };
    });
  };

  const finishSave = () => {
    skipAutosave.current = true;
    removeKey(draftKey(draftId));
    invalidateResource("workout-templates");
    invalidateResource("planned-workouts");
  };

  async function save(mode: "save" | "start" | "dup") {
    setSaving(mode);
    try {
      const input = { name: mode === "dup" ? `${draft.name.trim()} copy` : draft.name.trim(), description: draft.description.trim() || undefined, exercises: draft.exercises };
      const row = mode === "dup" || !id ? await createTemplate(input) : await updateTemplate(id, input);
      finishSave();
      if (mode === "start") {
        await startFromRow(row);
        invalidateResource("active-session");
        router.replace("/workout/active");
      } else {
        toast.success(mode === "dup" ? "Duplicated to your templates" : id ? "Changes saved" : "Template saved");
        if (router.canGoBack()) router.back();
    else router.replace("/workouts");
      }
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setSaving(null);
    }
  }

  const discard = () =>
    Alert.alert(dirty ? "Discard changes?" : "Leave the builder?", dirty ? "Your edits to this workout will be lost." : undefined, [
      { text: "Keep editing", style: "cancel" },
      {
        text: dirty ? "Discard" : "Leave",
        style: "destructive",
        onPress: () => {
          finishSave();
          if (router.canGoBack()) router.back();
    else router.replace("/workouts");
        },
      },
    ]);

  if (!loaded) return <Screen><PageHeader title={id ? "Edit workout" : "Create workout"} /><PageSkeleton /></Screen>;

  return (
    <Screen>
      <PageHeader title={id ? "Edit workout" : from ? "Customize workout" : "Create workout"} subtitle={from && !id ? "Changes save as your own template — the preset stays as it is." : undefined} />

      {restored ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 12, borderRadius: radius.small, backgroundColor: "rgba(131,233,244,0.10)" }}>
          <Ionicons name="time-outline" size={16} color={colors.cyan} />
          <Text variant="meta" color="secondary" style={{ flex: 1 }}>Restored your unsaved changes.</Text>
          <Pressable onPress={() => { animate(); setDraft(original); setRestored(false); removeKey(draftKey(draftId)); }} hitSlop={8}><Text variant="meta" color="pink">Start over</Text></Pressable>
        </View>
      ) : null}

      <View style={{ gap: 12, marginBottom: 12 }}>
        <Field label="name" value={draft.name} onChangeText={(name) => setDraft((d) => ({ ...d, name }))} placeholder="Upper body A" returnKeyType="next" maxLength={60} />
        <Field label="description · optional" value={draft.description} onChangeText={(description) => setDraft((d) => ({ ...d, description }))} placeholder="What this session is for" maxLength={200} />
      </View>
      <Text variant="meta" color="tertiary" style={{ marginBottom: 10 }}>{draft.exercises.length} exercises · ~{duration} min{dirty ? " · unsaved" : ""}</Text>

      {draft.exercises.length === 0 ? (
        <Pressable onPress={() => setPicking(true)} style={{ padding: 28, borderRadius: radius.large, borderWidth: 1, borderStyle: "dashed", borderColor: colors.lineHighlight, alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Ionicons name="add-circle-outline" size={28} color={colors.textSecondary} />
          <Text>Add your first exercise</Text>
          <Text variant="meta" color="tertiary">Search the library by name or muscle.</Text>
        </Pressable>
      ) : null}

      {draft.exercises.map((e, i) => {
        const head = e.supersetGroup != null && !linked(i);
        const open = expanded === i;
        return (
          <View key={`${e.name}-${i}`}>
            {i > 0 ? (
              <Pressable onPress={() => toggleLink(i)} accessibilityRole="button" style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Ionicons name={linked(i) ? "link" : "unlink-outline"} size={13} color={linked(i) ? colors.mauve : colors.textTertiary} />
                <Text variant="meta" style={{ color: linked(i) ? colors.pinkSoft : colors.textTertiary }}>{linked(i) ? "Superset — tap to unlink" : "Link into superset"}</Text>
              </Pressable>
            ) : null}
            {head ? <Label style={{ color: colors.mauve, marginBottom: 4, marginLeft: 4 }}>SUPERSET {supersetLetter(e.supersetGroup!)}</Label> : null}
            <Card style={{ marginBottom: 0, padding: 14, borderLeftWidth: e.supersetGroup != null ? 3 : 1, borderLeftColor: e.supersetGroup != null ? colors.mauve : undefined }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ gap: 2 }}>
                  <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={6} accessibilityLabel="Move up"><Ionicons name="chevron-up" size={18} color={i === 0 ? colors.lineHighlight : colors.textSecondary} /></Pressable>
                  <Pressable onPress={() => move(i, 1)} disabled={i === draft.exercises.length - 1} hitSlop={6} accessibilityLabel="Move down"><Ionicons name="chevron-down" size={18} color={i === draft.exercises.length - 1 ? colors.lineHighlight : colors.textSecondary} /></Pressable>
                </View>
                <ExerciseThumb name={e.name} size={38} />
                <Pressable style={{ flex: 1 }} onPress={() => { animate(); setExpanded(open ? null : i); }} accessibilityHint="Edit sets, reps and rest">
                  <Text numberOfLines={1} style={{ fontSize: 16 }}>{e.name}</Text>
                  <Text variant="meta" color="tertiary">{e.sets} × {e.repsMin === e.repsMax ? e.repsMin : `${e.repsMin}–${e.repsMax}`} · {e.restSec}s rest{e.rpe != null ? ` · RPE ${e.rpe}` : ""}{e.warmup ? " · warm-up" : ""}</Text>
                </Pressable>
                <Pressable onPress={() => duplicate(i)} hitSlop={8} accessibilityLabel="Duplicate exercise"><Ionicons name="copy-outline" size={18} color={colors.textSecondary} /></Pressable>
                <Pressable onPress={() => remove(i)} hitSlop={8} accessibilityLabel="Remove exercise"><Ionicons name="trash-outline" size={18} color={colors.textSecondary} /></Pressable>
              </View>
              {open ? (
                <View style={{ gap: 12, marginTop: 14 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Stepper compact label="sets" value={e.sets} step={1} min={1} max={20} onChange={(v) => patchEx(i, { sets: Math.max(1, Math.round(v ?? 1)) })} />
                    <Stepper compact label="rest" suffix="s" value={e.restSec} step={15} max={600} onChange={(v) => patchEx(i, { restSec: Math.round(v ?? 0) })} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Stepper compact label="reps min" value={e.repsMin} step={1} min={1} max={100} onChange={(v) => patchEx(i, { repsMin: Math.round(v ?? 1), repsMax: Math.max(e.repsMax, Math.round(v ?? 1)) })} />
                    <Stepper compact label="reps max" value={e.repsMax} step={1} min={1} max={100} onChange={(v) => patchEx(i, { repsMax: Math.max(e.repsMin, Math.round(v ?? e.repsMin)) })} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Stepper compact label="rpe target" value={e.rpe ?? null} step={0.5} min={5} max={10} onChange={(v) => patchEx(i, { rpe: v ?? undefined })} />
                    <View style={{ flex: 1, justifyContent: "flex-end", gap: 6 }}>
                      <Label style={{ textAlign: "center" }}>WARM-UP SET</Label>
                      <View style={{ height: 40, alignItems: "center", justifyContent: "center" }}><Toggle value={!!e.warmup} onChange={(v) => patchEx(i, { warmup: v || undefined })} /></View>
                    </View>
                  </View>
                  <TextInput value={e.note ?? ""} onChangeText={(t) => patchEx(i, { note: t || undefined })} placeholder="Note or cue · optional" placeholderTextColor={colors.textTertiary} maxLength={120} style={{ height: 44, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 15 }} />
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}

      <View style={{ gap: 10, marginTop: 14 }}>
        <Button label="Add exercise" variant="ghost" icon={<Ionicons name="add" size={18} color={colors.onColor} />} onPress={() => setPicking(true)} />
        <Button label={id ? "Save changes" : "Save template"} disabled={!canSave} loading={saving === "save"} onPress={() => save("save")} />
        <Button label="Save & start" variant="accent" disabled={!canSave} loading={saving === "start"} onPress={() => save("start")} />
        {!canSave && draft.exercises.length ? <Text variant="meta" color="tertiary" style={{ textAlign: "center" }}>Give it a name to save.</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 28, marginTop: 4 }}>
          {id ? <Pressable onPress={() => save("dup")} disabled={!canSave || !!saving} hitSlop={8}><Text color="secondary">{saving === "dup" ? "Duplicating…" : "Duplicate"}</Text></Pressable> : null}
          <Pressable onPress={discard} hitSlop={8}><Text color="tertiary">Discard</Text></Pressable>
        </View>
      </View>

      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(ex) => {
          animate();
          setDraft((d) => ({ ...d, exercises: [...d.exercises, { name: ex.name, exerciseId: ex.id, sets: 3, repsMin: 8, repsMax: 12, restSec: 90 }] }));
          setExpanded(draft.exercises.length);
          setPicking(false);
          Haptics.selectionAsync().catch(() => {});
        }}
      />
    </Screen>
  );
}
