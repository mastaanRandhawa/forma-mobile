import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { api } from "@/api/client";
import type { Exercise, ExerciseDetail, ExerciseHistory } from "@/api/types";
import { useAuth } from "@/auth/auth-provider";
import { fromKg, unitLabel } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip } from "@/components/ui/controls";
import { PageHeader, Sheet } from "@/components/ui/extra";
import { Label, Text } from "@/components/ui/text";

const MUSCLES = ["All", "Chest", "Back", "Lats", "Shoulders", "Biceps", "Triceps", "Glutes", "Quads", "Hamstrings", "Abs", "Calves"];
const EQUIPMENT = ["All", "Barbell", "Dumbbell", "Kettlebell", "Cable", "Machine", "Bodyweight", "Bands"];
const PAGE = 40;

function Thumb({ uri, size = 46 }: { uri?: string | null; size?: number }) {
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 12, backgroundColor: "#fff" }} resizeMode="cover" />
  ) : (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: colors.surface }} />
  );
}

export default function ExerciseLibrary() {
  useTheme();
  const { user } = useAuth();
  const units = user?.unitPreference ?? "imperial";
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("All");
  const [equipment, setEquipment] = useState("All");
  const [items, setItems] = useState<Exercise[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [hist, setHist] = useState<ExerciseHistory | null>(null);

  const load = useCallback(async (skip: number, replace: boolean) => {
    setBusy(true);
    try {
      const r = await api.library.exercises({
        q: q.trim() || undefined,
        muscle: muscle === "All" ? undefined : muscle.toLowerCase(),
        equipment: equipment === "All" ? undefined : equipment.toLowerCase(),
        take: PAGE,
        skip,
      });
      setItems((cur) => (replace ? r.items : [...cur, ...r.items]));
      setTotal(r.total);
    } catch {
      /* keep the previous page */
    } finally {
      setBusy(false);
    }
  }, [q, muscle, equipment]);

  useEffect(() => {
    const t = setTimeout(() => void load(0, true), 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setDetail(null);
    setHist(null);
    if (!selected) return;
    api.library.exercise(selected.slug).then(setDetail).catch(() => {});
    api.library.exerciseHistory(selected.slug, 5).then(setHist).catch(() => {});
  }, [selected]);

  const ex = detail ?? selected;

  return (
    <Screen>
      <PageHeader title="Exercises" subtitle={total ? `${total} in the library` : undefined} />
      <TextInput value={q} onChangeText={setQ} placeholder="Search by name, muscle or equipment" placeholderTextColor={colors.textTertiary} autoCapitalize="none" style={{ height: 48, borderRadius: radius.small, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16, marginBottom: 12 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
        {MUSCLES.map((m) => <Chip key={m} label={m} active={muscle === m} onPress={() => setMuscle(m)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
        {EQUIPMENT.map((m) => <Chip key={m} label={m} active={equipment === m} onPress={() => setEquipment(m)} />)}
      </ScrollView>

      {items.map((e) => (
        <Pressable key={e.id} onPress={() => setSelected(e)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
          <Thumb uri={e.imageStartUrl ?? e.imageEndUrl} />
          <View style={{ flex: 1 }}>
            <Text>{e.name}</Text>
            <Text variant="meta" color="tertiary">{[e.bodyPart ?? e.category, ...e.equipment.slice(0, 1)].join(" · ")} · {e.difficulty}</Text>
          </View>
          {e.mechanic ? <Label>{e.mechanic.toUpperCase()}</Label> : null}
        </Pressable>
      ))}
      {!busy && items.length === 0 ? <Text color="tertiary" style={{ paddingVertical: 24, textAlign: "center" }}>No exercises match those filters.</Text> : null}
      {items.length < total ? <View style={{ marginTop: 14 }}><Button label={busy ? "Loading…" : `Load more (${total - items.length} left)`} variant="ghost" onPress={() => load(items.length, false)} disabled={busy} /></View> : null}
      <Text variant="meta" color="tertiary" style={{ marginTop: 20, textAlign: "center" }}>Exercise data & illustrations by RepDB (repdb.co)</Text>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={ex?.name}>
        {ex ? (
          <>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[ex.imageStartUrl, ex.imageEndUrl].filter(Boolean).map((u, i) => <Image key={i} source={{ uri: u! }} style={{ flex: 1, aspectRatio: 1, borderRadius: 16, backgroundColor: "#fff" }} resizeMode="cover" />)}
            </View>
            <Text variant="meta" color="tertiary">{[ex.category, ex.movementPattern, ex.difficulty, ...ex.equipment].filter(Boolean).join(" · ")}</Text>
            {ex.description ? <Text color="secondary">{ex.description}</Text> : null}
            {ex.muscles?.length ? <Text variant="meta" color="secondary">Muscles: {ex.muscles.map((m) => m.muscleGroup?.name ?? m.role).join(", ")}</Text> : null}
            {ex.instructions.length ? <><Label>HOW TO</Label>{ex.instructions.map((s, i) => <Text key={i} color="secondary">{i + 1}. {s}</Text>)}</> : null}
            {ex.commonMistakes.length ? <><Label>COMMON MISTAKES</Label>{ex.commonMistakes.map((s, i) => <Text key={i} color="secondary">• {s}</Text>)}</> : null}
            {ex.aiFormTips.length ? <><Label>FORM TIPS</Label>{ex.aiFormTips.map((s, i) => <Text key={i} color="secondary">• {s}</Text>)}</> : null}
            {detail?.alternatives.length ? <><Label>ALTERNATIVES</Label><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{detail.alternatives.map((a) => <Chip key={a.slug} label={a.name} onPress={() => setSelected({ ...ex, slug: a.slug, name: a.name } as Exercise)} />)}</View></> : null}
            {hist?.history.length ? (
              <>
                <Label>YOUR HISTORY</Label>
                {hist.history.map((h) => (
                  <View key={h.sessionId} style={{ paddingVertical: 4 }}>
                    <Text variant="meta" color="tertiary">{new Date(h.date).toLocaleDateString()}</Text>
                    <Text color="secondary">{h.sets.map((s) => `${s.weightKg != null ? fromKg(s.weightKg, units) : "BW"}${unitLabel(units)}×${s.reps ?? "—"}${s.isPersonalRecord ? " 🏆" : ""}`).join("   ")}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
