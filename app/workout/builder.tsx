import { useEffect, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/api/client";
import { invalidateResource } from "@/api/hooks";
import { templateDurationMin, templateExerciseTarget, type TemplateExercise } from "@/lib/workout-templates";
import { createTemplate, startFromRow, updateTemplate, workoutToExercises } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, Field } from "@/components/ui/controls";
import { Card, PageHeader } from "@/components/ui/extra";
import { Label, Num, Text } from "@/components/ui/text";
import { ExercisePicker } from "./active";

const num = (s: string, fallback: number) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export default function WorkoutBuilder() {
  useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState<"save" | "start" | null>(null);

  useEffect(() => {
    if (!id) return;
    api.workouts.get(id).then((w) => {
      setName(w.name);
      setDescription(w.notes ?? "");
      setExercises(workoutToExercises(w));
    }).catch(() => {});
  }, [id]);

  const patch = (i: number, p: Partial<TemplateExercise>) => setExercises((l) => l.map((e, k) => (k === i ? { ...e, ...p } : e)));
  const move = (i: number, d: -1 | 1) =>
    setExercises((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const toggleSuperset = (i: number) =>
    setExercises((l) => {
      const c = [...l];
      const prev = c[i - 1];
      if (i === 0) return l;
      if (c[i].supersetGroup != null) c[i] = { ...c[i], supersetGroup: undefined };
      else {
        const g = prev.supersetGroup ?? Math.max(0, ...c.map((e) => e.supersetGroup ?? 0)) + 1;
        c[i - 1] = { ...prev, supersetGroup: g };
        c[i] = { ...c[i], supersetGroup: g };
      }
      return c;
    });

  const input = { height: 40, minWidth: 52, borderRadius: 10, backgroundColor: colors.surfaceRecessed, color: colors.textPrimary, textAlign: "center" as const, fontFamily: fonts.num, fontSize: 15, paddingHorizontal: 8 };
  const valid = name.trim().length > 0 && exercises.length > 0;

  async function save(start: boolean) {
    setSaving(start ? "start" : "save");
    try {
      const draft = { name: name.trim(), description: description.trim() || undefined, exercises };
      const row = id ? await updateTemplate(id, draft) : await createTemplate(draft);
      invalidateResource();
      if (start) {
        await startFromRow(row);
        router.replace("/workout/active");
      } else router.back();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Screen>
      <PageHeader title={id ? "Edit workout" : "Create workout"} />
      <View style={{ gap: 12, marginBottom: 14 }}>
        <Field label="name" value={name} onChangeText={setName} placeholder="Upper body A" />
        <Field label="notes" value={description} onChangeText={setDescription} placeholder="Optional" />
      </View>
      <Text variant="meta" color="tertiary" style={{ marginBottom: 8 }}>{exercises.length} exercises · ~{templateDurationMin(exercises)} min</Text>

      {exercises.map((e, i) => (
        <Card key={`${e.name}-${i}`} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text variant="heading" style={{ fontSize: 17 }}>{e.name}</Text>
              {e.supersetGroup != null ? <Label>SUPERSET {String.fromCharCode(64 + e.supersetGroup)}</Label> : null}
              <Text variant="meta" color="tertiary">{templateExerciseTarget(e)} · rest {e.restSec}s</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 14 }}>
              <Pressable onPress={() => move(i, -1)} hitSlop={8}><Ionicons name="arrow-up" size={18} color={colors.textSecondary} /></Pressable>
              <Pressable onPress={() => move(i, 1)} hitSlop={8}><Ionicons name="arrow-down" size={18} color={colors.textSecondary} /></Pressable>
              <Pressable onPress={() => setExercises((l) => l.filter((_, k) => k !== i))} hitSlop={8}><Ionicons name="close" size={18} color={colors.textSecondary} /></Pressable>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12, alignItems: "flex-end" }}>
            <View style={{ gap: 4 }}><Label>SETS</Label><TextInput style={input} keyboardType="number-pad" value={String(e.sets)} onChangeText={(t) => patch(i, { sets: num(t, 1) })} /></View>
            <View style={{ gap: 4 }}><Label>MIN</Label><TextInput style={input} keyboardType="number-pad" value={String(e.repsMin)} onChangeText={(t) => patch(i, { repsMin: num(t, 1) })} /></View>
            <View style={{ gap: 4 }}><Label>MAX</Label><TextInput style={input} keyboardType="number-pad" value={String(e.repsMax)} onChangeText={(t) => patch(i, { repsMax: num(t, e.repsMin) })} /></View>
            <View style={{ gap: 4 }}><Label>REST (S)</Label><TextInput style={input} keyboardType="number-pad" value={String(e.restSec)} onChangeText={(t) => patch(i, { restSec: num(t, 60) })} /></View>
          </View>
          {i > 0 ? <View style={{ flexDirection: "row", marginTop: 10 }}><Chip label={e.supersetGroup != null ? "Remove superset" : "Superset with previous"} active={e.supersetGroup != null} onPress={() => toggleSuperset(i)} /></View> : null}
        </Card>
      ))}

      <View style={{ gap: 10, marginTop: 4 }}>
        <Button label="Add exercise" variant="ghost" onPress={() => setPicking(true)} />
        <Button label="Save" disabled={!valid} loading={saving === "save"} onPress={() => save(false)} />
        <Button label="Save & start" variant="accent" disabled={!valid} loading={saving === "start"} onPress={() => save(true)} />
      </View>

      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(ex) => {
          setExercises((l) => [...l, { name: ex.name, sets: 3, repsMin: 8, repsMax: 12, restSec: 90 }]);
          setPicking(false);
        }}
      />
    </Screen>
  );
}
