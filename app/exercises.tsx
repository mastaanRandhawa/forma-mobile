/**
 * Exercise library — the website's page: the full RepDB catalog (601 movements),
 * searched on-device by name / equipment / body part / muscle, with muscle and
 * equipment filters, 80 rows at a time, and the same detail drawer (start and
 * peak illustrations side by side, chips, muscles, instructions, form tips).
 */
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Pressable, FlatList, Linking, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ExerciseThumb } from "@/components/exercise";
import { REPDB_URL, getRepdbCatalog, repdbImage, type RepDbCatalogEntry } from "@/lib/repdb";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { Pinned, Screen } from "@/components/ui/screen";
import { ListFooter } from "@/components/ui/loading";
import { Chip } from "@/components/ui/controls";
import { PageHeader, Sheet } from "@/components/ui/extra";
import { PressScale } from "@/components/ui/pressable";
import { Reveal } from "@/components/ui/reveal";
import { Label, Text } from "@/components/ui/text";
import { fuzzyFilter } from "@/lib/fuzzy";

const MUSCLES = ["All", "Chest", "Back", "Lats", "Shoulders", "Biceps", "Triceps", "Glutes", "Quads", "Hamstrings", "Abs", "Calves"];
const EQUIPMENT = ["All", "Barbell", "Dumbbell", "Kettlebell", "Cable", "Machine", "Bodyweight", "Bands"];
const LIMIT = 40;
const cap = (s: string | null | undefined) => (s ? s[0].toUpperCase() + s.slice(1) : null);

export default function ExerciseLibrary() {
  useTheme();
  const catalog = useMemo(() => getRepdbCatalog(), []);
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("All");
  const [equipment, setEquipment] = useState("All");
  const [selected, setSelected] = useState<RepDbCatalogEntry | null>(null);
  const needleRaw = useDeferredValue(q);

  const filtered = useMemo(() => {
    const pool = catalog.filter((e) => (muscle === "All" || [...e.primary, ...e.secondary].includes(muscle)) && (equipment === "All" || e.equipment === equipment));
    // typo-tolerant: "benc pres" and "dumbell curl" still find their exercise; exact and prefix hits rank first
    return fuzzyFilter(pool, needleRaw, (e) => `${e.name} ${e.equipment} ${e.bodyPart} ${[...e.primary, ...e.secondary].join(" ")}`, (e) => e.name);
  }, [catalog, needleRaw, muscle, equipment]);
  const [limit, setLimit] = useState(LIMIT);
  useEffect(() => setLimit(LIMIT), [needleRaw, muscle, equipment]);
  const shown = filtered.slice(0, limit);

  return (
    <Screen scroll={false} contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}>
      <PageHeader title="Exercises" />
      <Pinned>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: radius.small, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
          <Ionicons name="search" size={17} color={colors.textTertiary} />
          <TextInput value={q} onChangeText={setQ} placeholder={`Search ${catalog.length} movements`} placeholderTextColor={colors.textTertiary} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 }} />
          {q ? <Pressable onPress={() => setQ("")} hitSlop={10} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={colors.textTertiary} /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
          {MUSCLES.map((m) => <Chip key={m} label={m} active={muscle === m} onPress={() => setMuscle(m)} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
          {EQUIPMENT.map((m) => <Chip key={m} label={m} active={equipment === m} onPress={() => setEquipment(m)} />)}
        </ScrollView>
      </Pinned>
      <FlatList
        data={shown}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => setLimit((l) => (l < filtered.length ? l + LIMIT : l))}
        onEndReachedThreshold={0.6}
        initialNumToRender={14}
        windowSize={7}
        renderItem={({ item: e, index }) => (
          <Reveal index={index > 10 ? 0 : index}>
            <PressScale onPress={() => setSelected(e)} to={0.985} accessibilityLabel={e.name} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
              <ExerciseThumb uri={repdbImage(e.imgStart ?? e.imgEnd)} size={46} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1}>{e.name}</Text>
                <Text variant="meta" color="tertiary" numberOfLines={1}>{(e.primary[0] ?? e.bodyPart) + " · " + e.equipment} · {e.difficulty}</Text>
              </View>
              {e.mechanic ? <Label>{e.mechanic.toUpperCase()}</Label> : null}
            </PressScale>
          </Reveal>
        )}
        ListEmptyComponent={<Text color="tertiary" style={{ paddingVertical: 24, textAlign: "center" }}>No exercises match those filters.</Text>}
        ListFooterComponent={
          <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 6 }}>
            <ListFooter loading={limit < filtered.length} done={limit >= filtered.length && filtered.length > LIMIT} label={`All ${filtered.length} shown`} />
            <Text variant="meta" color="tertiary" style={{ textAlign: "center" }}>
              Exercise data & illustrations by <Text variant="meta" color="pink" onPress={() => Linking.openURL(REPDB_URL)}>RepDB (repdb.co)</Text>
            </Text>
          </View>
        }
      />
      <CatalogSheet entry={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function MuscleRow({ label, names, color }: { label: string; names: string[]; color: string }) {
  if (!names.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Label>{label.toUpperCase()}</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {names.map((n) => (
          <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineSoft }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
            <Text variant="meta" color="secondary">{n}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The website's ExerciseDetailDrawer, for a RepDB catalog entry. */
export function CatalogSheet({ entry: e, onClose }: { entry: RepDbCatalogEntry | null; onClose: () => void }) {
  const start = repdbImage(e?.imgStart);
  const end = repdbImage(e?.imgEnd);
  const chips = e ? [e.equipment, cap(e.difficulty), cap(e.mechanic), e.force && e.force !== "static" && e.force !== "dynamic" ? cap(e.force) : null, e.bodyweight ? "Bodyweight" : null, e.unilateral ? "Unilateral" : null].filter(Boolean) as string[] : [];
  return (
    <Sheet visible={!!e} onClose={onClose} title={e?.name ?? ""} eyebrow={e?.bodyPart}>
      {e ? (
        <>
          {start || end ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              {start ? (
                <View style={{ flex: 1, gap: 4 }}>
                  <ExerciseThumb uri={start} fill />
                  {end ? <Label style={{ textAlign: "center" }}>START</Label> : null}
                </View>
              ) : null}
              {end ? (
                <View style={{ flex: 1, gap: 4 }}>
                  <ExerciseThumb uri={end} fill />
                  <Label style={{ textAlign: "center" }}>PEAK</Label>
                </View>
              ) : null}
            </View>
          ) : null}
          {chips.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {chips.map((c) => <View key={c} style={{ paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: colors.surface, justifyContent: "center" }}><Text variant="meta" color="secondary">{c.toLowerCase()}</Text></View>)}
            </View>
          ) : null}
          {e.description ? <Text color="secondary">{e.description}</Text> : null}
          <MuscleRow label="Primary muscles" names={e.primary} color={colors.pink} />
          <MuscleRow label="Secondary muscles" names={e.secondary} color={colors.mauve} />
          {e.instructions.length ? (
            <View style={{ gap: 8 }}>
              <Label>INSTRUCTIONS</Label>
              {e.instructions.map((s, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: fonts.num, fontSize: 12 }}>{i + 1}</Text></View>
                  <Text color="secondary" style={{ flex: 1 }}>{s}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {e.tips.length ? <View style={{ gap: 6 }}><Label>FORM TIPS</Label>{e.tips.map((t, i) => <Text key={i} color="secondary">· {t}</Text>)}</View> : null}
          {e.goals.length || e.met != null ? <Text variant="meta" color="tertiary">{[e.goals.length ? `Best for: ${e.goals.join(", ")}` : null, e.met != null ? `${e.met} MET` : null].filter(Boolean).join(" · ")}</Text> : null}
          <Text variant="meta" color="tertiary">Exercise data & illustrations by RepDB (repdb.co)</Text>
        </>
      ) : null}
    </Sheet>
  );
}
