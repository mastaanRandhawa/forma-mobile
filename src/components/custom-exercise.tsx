import { useState } from "react";
import { Alert, ScrollView, TextInput, View } from "react-native";
import { api } from "@/api/client";
import { errorMessage, invalidateResource } from "@/api/hooks";
import type { CustomExerciseInput, Exercise } from "@/api/types";
import { colors, fonts, radius } from "@/theme/tokens";
import { Button, Chip } from "./ui/controls";
import { Sheet } from "./ui/extra";
import { toast } from "./ui/toast";
import { Label, Text } from "./ui/text";

const CATEGORIES = ["push", "pull", "legs", "core", "cardio", "mobility", "other"] as const;
const EQUIPMENT = ["bodyweight", "barbell", "dumbbell", "kettlebell", "cable", "machine", "bands"];
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const TRACKING = [{ v: "reps", l: "Reps" }, { v: "time", l: "Time" }, { v: "cardio", l: "Cardio" }] as const;
const MUSCLES = ["chest", "shoulders", "rear_delts", "triceps", "biceps", "forearms", "back", "lats", "traps", "abs", "obliques", "glutes", "quads", "hamstrings", "calves", "adductors"];
const nice = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const input = { minHeight: 48, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 } as const;

/** Create, edit or delete one of your own exercises. Pass `entry` to edit it. */
export function CustomExerciseSheet({ visible, entry, onClose, onSaved }: { visible: boolean; entry?: Exercise | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(entry?.name ?? "");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>((entry?.category as (typeof CATEGORIES)[number]) ?? "other");
  const [equipment, setEquipment] = useState<string[]>(entry?.equipment ?? ["bodyweight"]);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>(entry?.difficulty ?? "intermediate");
  const [tracking, setTracking] = useState<"reps" | "time" | "cardio">((entry as { trackingType?: "reps" | "time" | "cardio" } | null)?.trackingType ?? "reps");
  const [primary, setPrimary] = useState<string[]>(entry?.muscles?.filter((m) => m.role === "primary").map((m) => m.muscleGroup.key) ?? []);
  // secondary muscles aren't edited here, but an edit must not drop the ones already set
  const secondary = entry?.muscles?.filter((m) => m.role !== "primary").map((m) => m.muscleGroup.key) ?? [];
  const [steps, setSteps] = useState((entry?.instructions ?? []).join("\n"));
  const [link, setLink] = useState((entry as { mediaUrl?: string | null } | null)?.mediaUrl ?? "");
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const linkOk = !link.trim() || /^https:\/\/\S+$/i.test(link.trim());
  const valid = name.trim().length >= 2 && linkOk;

  const body = (): CustomExerciseInput => ({
    name: name.trim(),
    category,
    equipment,
    difficulty: level,
    trackingType: tracking,
    instructions: steps.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20),
    primaryMuscleKeys: primary,
    secondaryMuscleKeys: secondary.filter((k) => !primary.includes(k)),
    ...(link.trim() ? { mediaUrl: link.trim() } : entry ? { mediaUrl: null } : {}),
  });

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      if (entry) await api.library.updateCustom(entry.id, body());
      else await api.library.createCustom(body());
      invalidateResource("my-exercises");
      toast.success(entry ? "Exercise updated" : "Exercise added");
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert("Delete this exercise?", "Workouts that use it keep their history; it's removed from your list.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          if (!entry) return;
          setBusy(true);
          try {
            await api.library.deleteCustom(entry.id);
            invalidateResource("my-exercises");
            toast.success("Exercise deleted");
            onSaved();
          } catch (e) {
            toast.error(errorMessage(e as Error));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  const chips = (items: readonly string[], active: (v: string) => boolean, press: (v: string) => void, label: (v: string) => string = nice) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
      {items.map((v) => <Chip key={v} label={label(v)} active={active(v)} onPress={() => press(v)} />)}
    </ScrollView>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={entry ? "Edit exercise" : "New exercise"} eyebrow="My exercises" footer={<><Button label={entry ? "Save changes" : "Add exercise"} variant="accent" loading={busy} disabled={!valid} onPress={save} />{entry ? <Button label="Delete exercise" variant="text" onPress={remove} /> : null}</>}>
      <TextInput value={name} onChangeText={setName} maxLength={80} placeholder="Name, e.g. Sandbag carry" placeholderTextColor={colors.textTertiary} style={input} />
      <Label>TYPE</Label>
      {chips(CATEGORIES, (v) => v === category, (v) => setCategory(v as (typeof CATEGORIES)[number]))}
      <Label>HOW IT'S LOGGED</Label>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {TRACKING.map((t) => <Chip key={t.v} label={t.l} active={tracking === t.v} onPress={() => setTracking(t.v)} />)}
      </View>
      <Label>EQUIPMENT</Label>
      {chips(EQUIPMENT, (v) => equipment.includes(v), (v) => toggle(equipment, setEquipment, v))}
      <Label>LEVEL</Label>
      {chips(LEVELS, (v) => v === level, (v) => setLevel(v as (typeof LEVELS)[number]))}
      <Label>MAIN MUSCLES</Label>
      {chips(MUSCLES, (v) => primary.includes(v), (v) => toggle(primary, setPrimary, v))}
      <Label>STEPS (ONE PER LINE)</Label>
      <TextInput value={steps} onChangeText={setSteps} multiline placeholder="Optional" placeholderTextColor={colors.textTertiary} style={{ ...input, minHeight: 90, paddingTop: 12, textAlignVertical: "top" }} />
      <Label>PHOTO OR VIDEO LINK (OPTIONAL)</Label>
      <TextInput value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…" placeholderTextColor={colors.textTertiary} style={input} />
      {!linkOk ? <Text variant="meta" style={{ color: colors.amber }}>Use a link that starts with https://</Text> : null}
      {primary.length === 0 ? <Text variant="meta" color="tertiary">Pick at least one muscle so it counts on your muscle map.</Text> : null}
    </Sheet>
  );
}
