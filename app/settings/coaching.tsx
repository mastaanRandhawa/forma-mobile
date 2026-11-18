import { Pressable, View } from "react-native";
import { usePrefs, useProgression, useSettings } from "@/api/settings";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Card, PageHeader, SettingRow, Toggle } from "@/components/ui/extra";
import { Text } from "@/components/ui/text";

export function RadioRow({ active, onPress, title, body }: { active: boolean; onPress: () => void; title: string; body: string }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", gap: 12, padding: 14, borderRadius: radius.small, borderWidth: 1, borderColor: active ? colors.pink : colors.lineSoft, backgroundColor: active ? "rgba(213,26,122,0.12)" : colors.surface }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: active ? colors.pink : colors.lineHighlight, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
        {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pink }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16 }}>{title}</Text>
        <Text variant="meta" color="tertiary" style={{ fontSize: 13 }}>{body}</Text>
      </View>
    </Pressable>
  );
}

export default function Coaching() {
  useTheme();
  const { bundle, update, setGating } = useSettings();
  const prog = useProgression();
  const prefs = usePrefs();
  const onInteraction = bundle.disclosure.mode === "on_interaction";
  return (
    <Screen>
      <PageHeader title="Coaching & interface" />
      <Card title="Interface complexity">
        <Text color="secondary" style={{ marginBottom: 12 }}>Forma can start with the essentials and reveal more as you train, or show everything from day one.</Text>
        <View style={{ gap: 10 }}>
          <RadioRow active={prog.gatingEnabled} onPress={() => setGating(true)} title="Simple" body="Show the essentials and unlock more screens as I train." />
          <RadioRow active={!prog.gatingEnabled} onPress={() => setGating(false)} title="Full" body="Show all Forma features immediately." />
        </View>
        {prog.gatingEnabled && prog.nextUnlock ? (
          <Text variant="meta" color="pink" style={{ marginTop: 12 }}>Next: {prog.nextUnlock.requirement} ({prog.nextUnlock.progress.current}/{prog.nextUnlock.progress.target})</Text>
        ) : null}
      </Card>
      <Card title="Interface details">
        <View style={{ gap: 10 }}>
          <RadioRow active={!onInteraction} onPress={() => update({ disclosure: { mode: "always" } })} title="Always" body="Every widget shows its full detail all the time." />
          <RadioRow active={onInteraction} onPress={() => update({ disclosure: { mode: "on_interaction" } })} title="When interacting" body="Widgets stay calm and reveal detail when tapped." />
        </View>
      </Card>
      <Card title="Trainer behavior">
        <SettingRow title="Proactive trainer check-ins" hint="Kai reaches out between sessions with nudges and observations." right={<Toggle value={prefs.notifications.trainerCheckins} onChange={(v) => update({ prefs: { notifications: { trainerCheckins: v } } })} />} />
        <SettingRow last title="Camera form tracking" hint="Analyze exercise technique using your device's camera." right={<Toggle value={prefs.camera.formTracking} onChange={(v) => update({ prefs: { camera: { formTracking: v } } })} />} />
      </Card>
    </Screen>
  );
}
