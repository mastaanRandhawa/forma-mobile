import { useEffect, useRef, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Alert, Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useChatHistory, useDashboard, useInsights, useSuggestedPrompts, useTrainer } from "@/api/hooks";
import type { ChatMessage, Trainer as TrainerT } from "@/api/types";
import { useCustomization, useEquippedItem, useTheme } from "@/theme/theme-provider";
import { customizationItems } from "@/theme/catalog";
import { swatchColors } from "@/lib/swatch";
import { colors, fonts, radius } from "@/theme/tokens";
import { Atmosphere } from "@/components/ui/screen";
import { Button, Chip } from "@/components/ui/controls";
import { ActionMenu, Card, ErrorState, Sheet, Skel, SliderBar } from "@/components/ui/extra";
import { toast } from "@/components/ui/toast";
import { KaiOrb, coachMood } from "@/components/ui/kai-orb";
import { Label, Text } from "@/components/ui/text";
import { TourTarget } from "@/components/tour/tour";
import { DOCK_FULL, dockBottom } from "@/components/dock-metrics";

type Msg = { id: string; from: "trainer" | "user"; text: string; time: string; isProgram?: boolean };

const timeLabel = (iso?: string) => new Date(iso ?? Date.now()).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const toMsg = (m: ChatMessage): Msg => ({ id: m.id, from: m.role === "trainer" ? "trainer" : "user", text: m.content, time: timeLabel(m.createdAt) });

const isProgramIntent = (t: string) => /\b(program|plan|routine|schedule|build me|create a|design|make me)\b/i.test(t) && /\b(day|days|week|weeks|gain|lose|bulk|cut|strength|hypertrophy|muscle)\b/i.test(t);
const looksLikeProgram = (t: string) => /day 1|week 1|monday/i.test(t) && /sets|reps|exercise/i.test(t);

// API fields are 0–1 floats (the backend rejects anything else).
const SLIDERS: { key: "motivationLevel" | "coachingDirectness" | "formStrictness" | "speakingFrequency" | "coachingDetail" | "humor"; label: string; lo: string; hi: string }[] = [
  { key: "coachingDirectness", label: "Directness", lo: "Gentle", hi: "Blunt" },
  { key: "motivationLevel", label: "Intensity", lo: "Calm", hi: "Hype" },
  { key: "coachingDetail", label: "Detail", lo: "Brief", hi: "Thorough" },
  { key: "formStrictness", label: "Form strictness", lo: "Relaxed", hi: "Strict" },
  { key: "speakingFrequency", label: "Talkativeness", lo: "Quiet", hi: "Chatty" },
  { key: "humor", label: "Humor", lo: "Serious", hi: "Playful" },
];

type Style = Record<(typeof SLIDERS)[number]["key"], number>;

/** Coaching presets — each maps to concrete values for the six sliders (0–1). */
const PRESETS: { id: string; name: string; line: string; icon: keyof typeof Ionicons.glyphMap; v: Style }[] = [
  { id: "steady", name: "Steady", line: "Balanced, encouraging, to the point.", icon: "options-outline", v: { coachingDirectness: 0.5, motivationLevel: 0.5, coachingDetail: 0.5, formStrictness: 0.5, speakingFrequency: 0.5, humor: 0.4 } },
  { id: "spark", name: "Spark", line: "High energy and playful. Keeps you moving.", icon: "flash-outline", v: { coachingDirectness: 0.5, motivationLevel: 0.9, coachingDetail: 0.4, formStrictness: 0.4, speakingFrequency: 0.8, humor: 0.8 } },
  { id: "straight", name: "Straight talk", line: "Blunt, strict on form, no fluff.", icon: "locate-outline", v: { coachingDirectness: 0.9, motivationLevel: 0.5, coachingDetail: 0.5, formStrictness: 0.85, speakingFrequency: 0.5, humor: 0.2 } },
  { id: "analyst", name: "Analyst", line: "Thorough, data-minded, rarely jokes.", icon: "analytics-outline", v: { coachingDirectness: 0.7, motivationLevel: 0.3, coachingDetail: 0.95, formStrictness: 0.8, speakingFrequency: 0.5, humor: 0.1 } },
  { id: "calm", name: "Calm", line: "Gentle, quiet and patient.", icon: "leaf-outline", v: { coachingDirectness: 0.25, motivationLevel: 0.2, coachingDetail: 0.6, formStrictness: 0.4, speakingFrequency: 0.3, humor: 0.4 } },
];

const VOICES = [
  { id: "v-marcus", name: "Marcus", detail: "Warm, measured baritone" },
  { id: "v-nova", name: "Nova", detail: "Bright, quick, energetic" },
  { id: "v-atlas", name: "Atlas", detail: "Deep, calm, deliberate" },
  { id: "v-sable", name: "Sable", detail: "Low, dry, understated" },
];

function TypingDots() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={{ flexDirection: "row", gap: 5, paddingVertical: 4 }} accessibilityLabel="Trainer is typing">
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textSecondary, opacity: a.interpolate({ inputRange: [0, (i + 0.5) / 3.5, 1], outputRange: [0.3, 1, 0.3] }), transform: [{ translateY: a.interpolate({ inputRange: [0, (i + 0.5) / 3.5, 1], outputRange: [0, -3, 0] }) }] }} />
      ))}
    </View>
  );
}

export default function TrainerTab() {
  useTheme();
  const insets = useSafeAreaInsets();
  const history = useChatHistory();
  const prompts = useSuggestedPrompts();
  const trainer = useTrainer();
  const dashboard = useDashboard();
  const insights = useInsights();
  const look = useEquippedItem("avatar")?.id;
  const name = trainer.data?.name?.trim() || "Kai";

  const [thread, setThread] = useState<Msg[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState(false);
  const [menu, setMenu] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const router = useRouter();
  const cz = useCustomization();
  const [kb, setKb] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKb(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKb(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!seeded && history.data) {
      setThread(history.data.map(toMsg));
      setSeeded(true);
    }
  }, [history.data, seeded]);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [thread, typing]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || typing) return;
    const intent = isProgramIntent(body);
    setThread((t) => [...t, { id: `u${Date.now()}`, from: "user", text: body, time: timeLabel() }]);
    setDraft("");
    setTyping(true);
    try {
      const turn = await api.chat.send(body);
      setThread((t) => [...t, { ...toMsg(turn.trainerMessage), isProgram: intent && looksLikeProgram(turn.trainerMessage.content) }]);
    } catch (e) {
      setThread((t) => [...t, { id: `e${Date.now()}`, from: "trainer", text: errorMessage(e as Error), time: timeLabel() }]);
    } finally {
      setTyping(false);
    }
  }

  async function saveProgram(m: Msg, idx: number) {
    const userMsg = [...thread].slice(0, idx).reverse().find((x) => x.from === "user");
    try {
      await api.programs.generate({ name: userMsg?.text.slice(0, 60) ?? `${name}'s program`, daysPerWeek: 4 });
      setSaved((s) => new Set([...s, m.id]));
      invalidateResource("programs-list");
    } catch {
      /* ignore */
    }
  }

  /** Optimistic, debounced trainer update — reverts and reports on failure. */
  const patchTrainer = (p: Partial<TrainerT>, immediate = false) => {
    if (!trainer.data) return;
    const before = trainer.data;
    trainer.mutate({ ...before, ...p });
    if (patchTimer.current) clearTimeout(patchTimer.current);
    const send = () =>
      api.trainer.update(p).catch((e) => {
        trainer.mutate(before);
        toast.error(errorMessage(e as Error));
      });
    if (immediate) void send();
    else patchTimer.current = setTimeout(send, 400);
  };
  const ownedLooks = customizationItems.filter((i) => i.slot === "avatar" && cz.isOwned(i.id));

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
          <KaiOrb size={38} state={typing ? "thinking" : coachMood(dashboard.data)} look={look} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{name}</Text>
            <Text variant="meta" color="tertiary">Online · replies in seconds</Text>
          </View>
          <Pressable onPress={() => setMenu(true)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${name} actions`} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -8 }}><Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} /></Pressable>
        </View>

        <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {history.initialLoading ? <View style={{ gap: 12 }}><Skel h={44} w="70%" r={18} /><Skel h={44} w="55%" r={18} /></View> : null}
          {history.error && thread.length === 0 ? <ErrorState message={errorMessage(history.error)} onRetry={history.refetch} /> : null}
          {!history.initialLoading && thread.length === 0 && !typing && !history.error ? (
            <View style={{ alignItems: "center", gap: 8, paddingTop: 28, paddingBottom: 8 }}>
              <KaiOrb size={64} look={look} state={coachMood(dashboard.data)} />
              <Text variant="heading" style={{ marginTop: 6 }}>Hi, I'm {name}</Text>
              <Text color="secondary" style={{ textAlign: "center" }}>Ask about today's session, your form or a lift.</Text>
              <View style={{ alignSelf: "stretch", gap: 8, marginTop: 14 }}>
                {(prompts.data ?? []).slice(0, 3).map((p) => (
                  <Pressable key={p} onPress={() => send(p)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.medium, backgroundColor: colors.surface }}>
                    <Text variant="meta" color="secondary" numberOfLines={2}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {thread.map((m, i) => {
            const mine = m.from === "user";
            return (
              <View key={m.id} style={{ alignItems: mine ? "flex-end" : "flex-start", marginTop: thread[i - 1]?.from === m.from ? 0 : 8 }}>
                <View style={{ maxWidth: "86%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: mine ? 6 : 20, borderBottomLeftRadius: mine ? 20 : 6, backgroundColor: mine ? colors.surfaceFloat : colors.surfaceRecessed }}>
                  <Text color={mine ? "primary" : "secondary"}>{m.text}</Text>
                </View>
                {m.isProgram ? (
                  <View style={{ marginTop: 6 }}>
                    <Chip label={saved.has(m.id) ? "Saved to programs ✓" : "Save as program"} active={saved.has(m.id)} onPress={() => !saved.has(m.id) && saveProgram(m, i)} />
                  </View>
                ) : null}
                <Text variant="meta" color="tertiary" style={{ marginTop: 3, fontSize: 11 }}>{m.time}</Text>
              </View>
            );
          })}
          {typing ? <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8 }}><KaiOrb size={22} state="thinking" look={look} /><View style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.surfaceRecessed }}><TypingDots /></View></View> : null}
        </ScrollView>

        {thread.length > 0 && thread.length < 2 && prompts.data?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 8 }}>
            {prompts.data.map((p) => <Chip key={p} label={p} onPress={() => send(p)} />)}
          </ScrollView>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: kb ? 10 : dockBottom(insets.bottom) + DOCK_FULL + 10 }}>
          <TourTarget id="coach-composer" style={{ flex: 1 }}><TextInput value={draft} onChangeText={setDraft} placeholder={`Message ${name}`} placeholderTextColor={colors.textTertiary} multiline style={{ flex: 1, maxHeight: 120, minHeight: 46, borderRadius: radius.large, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.surfaceRecessed, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 }} /></TourTarget>
          <Pressable onPress={() => send(draft)} disabled={!draft.trim() || typing} accessibilityRole="button" accessibilityLabel="Send message" style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.btnWhite, alignItems: "center", justifyContent: "center", opacity: draft.trim() && !typing ? 1 : 0.5 }}>
            <Ionicons name="arrow-up" size={22} color={colors.btnWhiteInk} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={settings} onClose={() => { setSettings(false); setNameDraft(null); }} eyebrow="Trainer" title={`Customize ${name}`}>
        <Label>NAME</Label>
        <TextInput
          value={nameDraft ?? trainer.data?.name ?? ""}
          onChangeText={(t) => setNameDraft(t.slice(0, 24))}
          onEndEditing={() => { const n = (nameDraft ?? "").trim(); if (nameDraft != null && n && n !== trainer.data?.name) patchTrainer({ name: n }, true); setNameDraft(null); }}
          placeholder="Kai"
          placeholderTextColor={colors.textTertiary}
          maxLength={24}
          returnKeyType="done"
          style={{ height: 48, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 }}
        />
        <Label style={{ marginTop: 6 }}>COACHING STYLE</Label>
        <View style={{ gap: 8 }}>
          {PRESETS.map((pr) => {
            const on = SLIDERS.every((sl) => Math.abs(Number(trainer.data?.[sl.key] ?? 0.5) - pr.v[sl.key]) < 0.04);
            return (
              <Pressable key={pr.id} onPress={() => Alert.alert(`Switch to ${pr.name}?`, `This changes all six coaching sliders. ${pr.line}`, [{ text: "Cancel", style: "cancel" }, { text: "Apply", onPress: () => patchTrainer(pr.v, true) }])} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.medium, borderWidth: 1, borderColor: on ? colors.pink : "transparent", backgroundColor: on ? "rgba(213,26,122,0.12)" : colors.surface }}>
                <Ionicons name={pr.icon} size={20} color={on ? colors.pinkSoft : colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.semibold }}>{pr.name}</Text>
                  <Text variant="meta" color="tertiary">{pr.line}</Text>
                </View>
                {on ? <Ionicons name="checkmark" size={18} color={colors.pinkSoft} /> : null}
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setAdvanced((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: advanced }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
          <Text style={{ fontFamily: fonts.semibold }}>Advanced customization</Text>
          <Ionicons name={advanced ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
        </Pressable>
        {advanced ? (
          <View style={{ gap: 14 }}>
        {SLIDERS.map((sl) => (
          <View key={sl.key} style={{ gap: 2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text>{sl.label}</Text>
              <Text variant="meta" color="tertiary">{sl.lo} · {Math.round(Number(trainer.data?.[sl.key] ?? 0.5) * 100)} · {sl.hi}</Text>
            </View>
            <SliderBar value={Number(trainer.data?.[sl.key] ?? 0.5)} onChange={(v) => trainer.data && trainer.mutate({ ...trainer.data, [sl.key]: v })} onCommit={(v) => patchTrainer({ [sl.key]: v })} accessibilityLabel={sl.label} />
          </View>
        ))}
        <Label style={{ marginTop: 6 }}>VOICE</Label>
        <Text variant="meta" color="tertiary" style={{ marginTop: -6 }}>Used for spoken coaching cues when voice is available.</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {VOICES.map((v) => {
            const on = (trainer.data?.voiceId ?? "v-marcus") === v.id;
            return (
              <Pressable key={v.id} onPress={() => patchTrainer({ voiceId: v.id }, true)} accessibilityState={{ selected: on }} style={{ width: "48%", padding: 12, borderRadius: radius.small, borderWidth: 1, borderColor: on ? colors.pink : colors.lineSoft, backgroundColor: on ? "rgba(213,26,122,0.12)" : colors.surface }}>
                <Text>{v.name}</Text>
                <Text variant="meta" color="tertiary">{v.detail}</Text>
              </Pressable>
            );
          })}
        </View>
          </View>
        ) : null}
        <Label style={{ marginTop: 6 }}>{name.toUpperCase()}'S LOOK</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {ownedLooks.map((it) => {
            const on = cz.isEquipped(it.id, "avatar");
            return (
              <Pressable key={it.id} onPress={() => cz.setSlot("avatar", it.id)} accessibilityLabel={`${it.name} look${on ? ", equipped" : ""}`} style={{ width: 44, height: 44, borderRadius: 22, padding: 3, borderWidth: 2, borderColor: on ? colors.pink : "transparent" }}>
                <LinearGradient colors={swatchColors(it.swatch)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 19 }} />
              </Pressable>
            );
          })}
          <Chip label="More looks" onPress={() => { setSettings(false); router.push("/store"); }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: radius.small, backgroundColor: colors.surface }}>
          <KaiOrb size={26} look={look} />
          <Text variant="meta" color="secondary" style={{ flex: 1 }}>This is how {name} shows up in chat and on Home.</Text>
        </View>
      </Sheet>

      <ActionMenu
        visible={menu}
        onClose={() => setMenu(false)}
        title={name}
        actions={[
          { label: "Plan today's workout", icon: "barbell-outline", onPress: () => router.push("/workouts") },
          { label: "Log food", icon: "nutrition-outline", onPress: () => router.push("/nutrition?add=1") },
          { label: "Coaching insights", icon: "bulb-outline", onPress: () => setShowInsights(true) },
          { label: `Customize ${name}`, icon: "options-outline", onPress: () => setSettings(true) },
          { label: "Clear chat history", icon: "trash-outline", destructive: true, onPress: () => Alert.alert("Clear chat history?", `Your conversation with ${name} will be deleted. This can't be undone.`, [
            { text: "Cancel", style: "cancel" },
            { text: "Clear", style: "destructive", onPress: async () => { try { await api.chat.clear(); setThread([]); invalidateResource("chat"); toast.success("Chat cleared"); } catch (e) { toast.error(errorMessage(e as Error)); } } },
          ]) },
        ]}
      />

      <Sheet visible={showInsights} onClose={() => setShowInsights(false)} title="Coaching insights">
        {(insights.data ?? []).length === 0 ? <Text color="secondary">No insights yet. Keep training and your coach will have something to say.</Text> : null}
        {(insights.data ?? []).filter((i) => !i.dismissedAt).map((i) => (
          <Card key={i.id} style={{ marginBottom: 0 }}>
            <Label>{i.category.toUpperCase()}</Label>
            <Text variant="heading" style={{ fontSize: 17, marginVertical: 4 }}>{i.title}</Text>
            <Text color="secondary">{i.body}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Chip label="Dismiss" onPress={async () => { await api.trainer.dismissInsight(i.id).catch(() => {}); insights.refetch(); }} />
            </View>
          </Card>
        ))}
        <Button label="Generate new insights" variant="ghost" onPress={async () => { await api.trainer.generateInsights().catch(() => {}); insights.refetch(); }} />
      </Sheet>
    </View>
  );
}
