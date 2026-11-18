import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useChatHistory, useInsights, useSuggestedPrompts, useTrainer } from "@/api/hooks";
import type { ChatMessage, Trainer as TrainerT } from "@/api/types";
import { useEquippedItem, useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { Atmosphere } from "@/components/ui/screen";
import { Button, Chip } from "@/components/ui/controls";
import { Card, ErrorState, Sheet, Skel } from "@/components/ui/extra";
import { KaiOrb } from "@/components/ui/kai-orb";
import { Label, Text } from "@/components/ui/text";

type Msg = { id: string; from: "trainer" | "user"; text: string; time: string; isProgram?: boolean };

const timeLabel = (iso?: string) => new Date(iso ?? Date.now()).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const toMsg = (m: ChatMessage): Msg => ({ id: m.id, from: m.role === "trainer" ? "trainer" : "user", text: m.content, time: timeLabel(m.createdAt) });

const isProgramIntent = (t: string) => /\b(program|plan|routine|schedule|build me|create a|design|make me)\b/i.test(t) && /\b(day|days|week|weeks|gain|lose|bulk|cut|strength|hypertrophy|muscle)\b/i.test(t);
const looksLikeProgram = (t: string) => /day 1|week 1|monday/i.test(t) && /sets|reps|exercise/i.test(t);

const SLIDERS: { key: keyof TrainerT; label: string; lo: string; hi: string }[] = [
  { key: "motivationLevel", label: "Motivation", lo: "Calm", hi: "Hype" },
  { key: "coachingDirectness", label: "Directness", lo: "Gentle", hi: "Blunt" },
  { key: "formStrictness", label: "Form strictness", lo: "Relaxed", hi: "Strict" },
  { key: "speakingFrequency", label: "Talks", lo: "Rarely", hi: "Often" },
  { key: "coachingDetail", label: "Detail", lo: "Brief", hi: "Thorough" },
  { key: "humor", label: "Humor", lo: "Serious", hi: "Playful" },
];

function Level({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: n <= value ? colors.pink : "rgba(255,255,255,0.12)" }} />
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
  const insights = useInsights();
  const look = useEquippedItem("avatar")?.id;
  const name = trainer.data?.name?.trim() || "Kai";

  const [thread, setThread] = useState<Msg[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

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

  const patchTrainer = async (key: keyof TrainerT, n: number) => {
    trainer.mutate({ ...(trainer.data as TrainerT), [key]: n });
    await api.trainer.update({ [key]: n }).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Atmosphere />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
          <KaiOrb size={38} state={typing ? "thinking" : "idle"} look={look} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">{name}</Text>
            <Text variant="meta" color="tertiary">Online · replies in seconds</Text>
          </View>
          <Pressable onPress={() => setShowInsights(true)} hitSlop={10}><Ionicons name="bulb-outline" size={22} color={colors.textSecondary} /></Pressable>
          <Pressable onPress={() => setSettings(true)} hitSlop={10}><Ionicons name="options-outline" size={22} color={colors.textSecondary} /></Pressable>
        </View>

        <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {history.initialLoading ? <View style={{ gap: 12 }}><Skel h={44} w="70%" r={18} /><Skel h={44} w="55%" r={18} /></View> : null}
          {history.error && thread.length === 0 ? <ErrorState message={errorMessage(history.error)} onRetry={history.refetch} /> : null}
          {!history.initialLoading && thread.length === 0 && !typing && !history.error ? (
            <View style={{ alignItems: "center", gap: 10, paddingVertical: 40 }}>
              <KaiOrb size={56} look={look} />
              <Text variant="heading">Say hi to {name}</Text>
              <Text color="secondary" style={{ textAlign: "center" }}>Ask about today's session, your form, an injury, or how a lift is progressing.</Text>
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
          {typing ? <View style={{ alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, backgroundColor: colors.surfaceRecessed }}><Text color="tertiary">…</Text></View> : null}
        </ScrollView>

        {thread.length < 2 && prompts.data?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 8 }}>
            {prompts.data.map((p) => <Chip key={p} label={p} onPress={() => send(p)} />)}
          </ScrollView>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 96 + Math.max(0, insets.bottom - 12) }}>
          <TextInput value={draft} onChangeText={setDraft} placeholder={`Message ${name}`} placeholderTextColor={colors.textTertiary} multiline style={{ flex: 1, maxHeight: 120, minHeight: 46, borderRadius: radius.large, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.surfaceRecessed, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 }} />
          <Pressable onPress={() => send(draft)} disabled={!draft.trim() || typing} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.btnWhite, alignItems: "center", justifyContent: "center", opacity: draft.trim() && !typing ? 1 : 0.5 }}>
            <Ionicons name="arrow-up" size={22} color={colors.btnWhiteInk} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={settings} onClose={() => setSettings(false)} title="Trainer settings">
        {SLIDERS.map((s) => (
          <View key={s.key} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text>{s.label}</Text><Label>{s.lo} → {s.hi}</Label></View>
            <Level value={Number(trainer.data?.[s.key] ?? 3)} onChange={(n) => patchTrainer(s.key, n)} />
          </View>
        ))}
        <Button label="Clear chat history" variant="ghost" onPress={async () => { await api.chat.clear().catch(() => {}); setThread([]); invalidateResource("chat"); setSettings(false); }} />
      </Sheet>

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
