/**
 * Shared exercise UI: thumbnail, the searchable picker sheet, and the detail
 * sheet (illustrations, muscles, instructions, tips, alternatives, your
 * history). Used by the library, the builder and the active workout.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { repdbEntryFor, repdbImage, repdbThumb } from "@/lib/repdb";
import { withAlpha } from "@/lib/color";
import { motion } from "@/lib/motion";
import { useTheme } from "@/theme/theme-provider";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/api/client";
import type { Exercise, ExerciseDetail, ExerciseHistory } from "@/api/types";
import { useAuth } from "@/auth/auth-provider";
import { fromKg, unitLabel } from "@/lib/workouts";
import { colors, fonts, radius } from "@/theme/tokens";
import { Chip } from "./ui/controls";
import { Sheet } from "./ui/extra";
import { ListFooter, SkelRows } from "./ui/loading";
import { Label, Text } from "./ui/text";

/**
 * ExerciseThumb — port of the website's component: a RepDB illustration that
 * fades in over a soft skeleton, with a dumbbell glyph when there's no image or
 * the fetch fails. Pass `name` and the image is found the way the web does
 * (API url first, else the RepDB catalog match by name); `fill` makes a
 * responsive square for detail figures.
 */
export function ExerciseThumb({ uri, name, size = 46, fill = false }: { uri?: string | null; name?: string; size?: number; fill?: boolean }) {
  useTheme();
  const src = uri ?? (name ? repdbThumb(name) : null);
  const [state, setState] = useState<"loading" | "ok" | "error">(src ? "loading" : "error");
  useEffect(() => setState(src ? "loading" : "error"), [src]);
  // react-native-web can miss `onLoad` for an image the browser already had cached
  // (it completes before the handler is attached) — never leave it hidden.
  useEffect(() => {
    if (!src) return;
    const t = setTimeout(() => setState((cur) => (cur === "loading" ? "ok" : cur)), 900);
    return () => clearTimeout(t);
  }, [src]);
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withTiming(state === "ok" ? 1 : 0, { duration: motion.reduced ? 0 : 300 });
  }, [state, o]);
  const fade = useAnimatedStyle(() => ({ opacity: o.value }));
  const box = fill ? { width: "100%" as const, aspectRatio: 1 } : { width: size, height: size };
  return (
    <View style={[box, { borderRadius: radius.small > size / 2 ? size / 2 : Math.min(radius.small, Math.round(size / 3)), overflow: "hidden", backgroundColor: colors.surfaceRecessed }]}>
      {state === "error" ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="barbell-outline" size={fill ? 40 : size * 0.42} color={colors.textTertiary} />
        </View>
      ) : (
        <>
          {state === "loading" ? <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.textPrimary, 0.05) }]} /> : null}
          <Animated.Image
            source={{ uri: src as string }}
            onLoad={() => setState("ok")}
            onLoadEnd={() => setState((cur) => (cur === "loading" ? "ok" : cur))}
            onError={() => setState("error")}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            style={[StyleSheet.absoluteFill, { backgroundColor: "#1a0f16" }, fade]}
          />
        </>
      )}
    </View>
  );
}

const MUSCLES = ["All", "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Glutes", "Quads", "Hamstrings", "Abs", "Calves"];

/** Searchable exercise picker — debounced server search with muscle filter chips. */
export function ExercisePicker({ visible, onClose, onPick, title = "Add exercise" }: { visible: boolean; onClose: () => void; onPick: (e: Exercise) => void; title?: string }) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("All");
  const [items, setItems] = useState<Exercise[] | null>(null);
  const [error, setError] = useState(false);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState(false);
  const run = useCallback((text: string, m: string) => {
    setError(false);
    api.library
      .exercises({ q: text || undefined, muscle: m === "All" ? undefined : m.toLowerCase(), take: 30 })
      .then((r) => { setItems(r.items); setTotal(r.total ?? r.items.length); })
      .catch(() => setError(true));
  }, []);
  const loadMore = () => {
    if (more || !items) return;
    setMore(true);
    api.library
      .exercises({ q: q.trim() || undefined, muscle: muscle === "All" ? undefined : muscle.toLowerCase(), take: 30, skip: items.length })
      .then((r) => setItems((cur) => [...(cur ?? []), ...r.items.filter((x) => !(cur ?? []).some((c) => c.id === x.id))]))
      .catch(() => setError(true))
      .finally(() => setMore(false));
  };
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => run(q.trim(), muscle), 250);
    return () => clearTimeout(t);
  }, [q, muscle, visible, run]);
  useEffect(() => {
    if (!visible) {
      setQ("");
      setItems(null);
    }
  }, [visible]);
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: radius.small, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
        <Ionicons name="search" size={17} color={colors.textTertiary} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search exercises" placeholderTextColor={colors.textTertiary} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 }} />
        {q ? <Pressable onPress={() => setQ("")} hitSlop={10}><Ionicons name="close-circle" size={18} color={colors.textTertiary} /></Pressable> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
        {MUSCLES.map((m) => <Chip key={m} label={m} active={muscle === m} onPress={() => setMuscle(m)} />)}
      </ScrollView>
      {items === null && !error ? <View style={{ paddingVertical: 8 }}><SkelRows count={5} thumb={42} /></View> : null}
      {error ? <Text color="secondary">Couldn't search the library. Check your connection.</Text> : null}
      {items?.length === 0 ? <Text color="tertiary" style={{ textAlign: "center", paddingVertical: 16 }}>No exercises match.</Text> : null}
      {items?.map((e) => (
        <Pressable key={e.id} onPress={() => onPick(e)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
          <ExerciseThumb uri={e.imageStartUrl ?? e.imageEndUrl} name={e.name} size={42} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1}>{e.name}</Text>
            <Text variant="meta" color="tertiary" numberOfLines={1}>{[e.bodyPart ?? e.category, ...e.equipment.slice(0, 1)].filter(Boolean).join(" · ")}</Text>
          </View>
          <Ionicons name="add-circle-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      ))}
      {items && items.length < total ? (
        more ? <ListFooter loading /> : (
          <Pressable onPress={loadMore} accessibilityRole="button" style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            <Text variant="meta" color="pink">Show more · {items.length} of {total}</Text>
          </Pressable>
        )
      ) : null}
    </Sheet>
  );
}

/** Deep-dive for one exercise. Pass a slug (and optionally a preloaded row). */
export function ExerciseDetailSheet({ slug, preview, onClose, onOpenSlug }: { slug: string | null; preview?: Exercise | null; onClose: () => void; onOpenSlug?: (slug: string) => void }) {
  const { user } = useAuth();
  const units = user?.unitPreference ?? "imperial";
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [hist, setHist] = useState<ExerciseHistory | null>(null);
  const [error, setError] = useState(false);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setDetail(null);
    setHist(null);
    setError(false);
    if (!slug) return;
    api.library.exercise(slug).then(setDetail).catch(() => setError(true));
    api.library.exerciseHistory(slug, 5).then(setHist).catch(() => {});
  }, [slug]);

  const ex: Exercise | null = detail ?? (preview && preview.slug === slug ? preview : null);
  // The seeded API exercises have no images/long-form text; the website fills
  // them from the RepDB catalog by name, so do the same here.
  const cat = useMemo(() => (ex ? repdbEntryFor(ex.name) : null), [ex]);
  const frames = [ex?.imageStartUrl ?? repdbImage(cat?.imgStart), ex?.imageEndUrl ?? repdbImage(cat?.imgEnd)].filter(Boolean) as string[];
  useEffect(() => {
    if (!slug || frames.length < 2) return;
    const t = setInterval(() => setFrame((f) => (f ? 0 : 1)), 900);
    return () => clearInterval(t);
  }, [slug, frames.length]);

  const chips = [ex?.equipment[0], ex?.difficulty, ex?.mechanic, ex?.forceType && !["static", "dynamic"].includes(ex.forceType) ? ex.forceType : null, ex?.isBodyweight ? "bodyweight" : null, ex?.isUnilateral ? "unilateral" : null].filter(Boolean) as string[];
  const primary = (ex?.muscles?.filter((m) => m.role === "primary").map((m) => m.muscleGroup?.name).filter(Boolean) as string[] | undefined)?.length ? (ex?.muscles?.filter((m) => m.role === "primary").map((m) => m.muscleGroup?.name).filter(Boolean) as string[]) : cat?.primary;
  const secondary = (ex?.muscles?.filter((m) => m.role !== "primary").map((m) => m.muscleGroup?.name).filter(Boolean) as string[] | undefined)?.length ? (ex?.muscles?.filter((m) => m.role !== "primary").map((m) => m.muscleGroup?.name).filter(Boolean) as string[]) : cat?.secondary;
  const tips = [...(ex?.formTips ?? []), ...(ex?.aiFormTips ?? [])].length ? [...(ex?.formTips ?? []), ...(ex?.aiFormTips ?? [])] : cat?.tips ?? [];
  const steps = ex?.instructions?.length ? ex.instructions : cat?.instructions ?? [];
  const blurb = ex?.description ?? cat?.description ?? null;

  return (
    <Sheet visible={!!slug} onClose={onClose} title={ex?.name ?? "Exercise"} eyebrow={ex?.bodyPart ?? ex?.category ?? undefined}>
      {!ex && !error ? <ActivityIndicator color={colors.pinkSoft} style={{ marginVertical: 30 }} /> : null}
      {error && !ex ? <Text color="secondary">Couldn't load this exercise.</Text> : null}
      {ex ? (
        <>
          {frames.length ? (
            <View style={{ borderRadius: radius.medium, overflow: "hidden", backgroundColor: "#fff", aspectRatio: 1.4 }}>
              <Image source={{ uri: frames[frame % frames.length] }} style={{ flex: 1 }} resizeMode="contain" accessibilityLabel={`${ex.name} demonstration`} />
              {frames.length > 1 ? (
                <View style={{ position: "absolute", bottom: 10, left: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: "rgba(20,8,16,0.6)" }}>
                  <Text variant="meta" style={{ color: "#fff" }}>{frame % 2 ? "peak" : "start"}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {chips.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{chips.map((c) => <View key={c} style={{ paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: colors.surface, justifyContent: "center" }}><Text variant="meta" color="secondary">{c.toLowerCase()}</Text></View>)}</View> : null}
          {blurb ? <Text color="secondary">{blurb}</Text> : null}
          {primary?.length ? <MuscleRow label="Primary muscles" names={primary} color={colors.pink} /> : null}
          {secondary?.length ? <MuscleRow label="Secondary muscles" names={secondary} color={colors.mauve} /> : null}
          {steps.length ? (
            <View style={{ gap: 8 }}>
              <Label>INSTRUCTIONS</Label>
              {steps.map((s, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: fonts.num, fontSize: 12 }}>{i + 1}</Text></View>
                  <Text color="secondary" style={{ flex: 1 }}>{s}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {tips.length ? <View style={{ gap: 6 }}><Label>FORM TIPS</Label>{tips.map((s, i) => <Text key={i} color="secondary">· {s}</Text>)}</View> : null}
          {ex.commonMistakes.length ? <View style={{ gap: 6 }}><Label>COMMON MISTAKES</Label>{ex.commonMistakes.map((s, i) => <Text key={i} color="secondary">· {s}</Text>)}</View> : null}
          {(ex.trainingGoals?.length || ex.metValue != null) ? (
            <Text variant="meta" color="tertiary">{[ex.trainingGoals?.length ? `Best for: ${ex.trainingGoals.join(", ")}` : null, ex.metValue != null ? `${ex.metValue} MET` : null].filter(Boolean).join(" · ")}</Text>
          ) : null}
          {detail?.alternatives.length && onOpenSlug ? (
            <View style={{ gap: 8 }}>
              <Label>ALTERNATIVES</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{detail.alternatives.map((a) => <Chip key={a.slug} label={a.name} onPress={() => onOpenSlug(a.slug)} />)}</View>
            </View>
          ) : null}
          {hist?.history.length ? (
            <View style={{ gap: 6 }}>
              <Label>YOUR HISTORY</Label>
              {hist.history.map((h) => (
                <View key={h.sessionId} style={{ paddingVertical: 4, gap: 2 }}>
                  <Text variant="meta" color="tertiary">{new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</Text>
                  <Text color="secondary">{h.sets.map((s) => `${s.weightKg != null ? fromKg(s.weightKg, units) : "BW"}×${s.reps ?? "—"}${s.isPersonalRecord ? " ★" : ""}`).join("   ")}</Text>
                </View>
              ))}
              <Text variant="meta" color="tertiary">Weights in {unitLabel(units)} · ★ personal record</Text>
            </View>
          ) : null}
          <Text variant="meta" color="tertiary">Exercise data & illustrations by RepDB (repdb.co)</Text>
        </>
      ) : null}
    </Sheet>
  );
}

function MuscleRow({ label, names, color }: { label: string; names: string[]; color: string }) {
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
