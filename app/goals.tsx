import { useState } from "react";
import { Alert, View } from "react-native";
import { api } from "@/api/client";
import { useGoals } from "@/api/hooks";
import type { GoalCadence } from "@/api/types";
import { useTheme } from "@/theme/theme-provider";
import { gated } from "@/components/feature-gate";
import { Tone } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, Field, ProgressBar, SectionHeading } from "@/components/ui/controls";
import { Card, EmptyState, PageHeader, PageSkeleton, Sheet } from "@/components/ui/extra";
import { Label, Num, Text } from "@/components/ui/text";

const TONES: Tone[] = ["pink", "cyan", "lime", "amber", "mauve", "violet"];
const PRESETS = [
  { key: "workouts", label: "Weekly workouts", target: 4, unit: "sessions", cadence: "weekly" as GoalCadence },
  { key: "protein", label: "Daily protein", target: 150, unit: "g", cadence: "daily" as GoalCadence },
  { key: "steps", label: "Daily steps", target: 10000, unit: "steps", cadence: "daily" as GoalCadence },
  { key: "sleep", label: "Sleep", target: 8, unit: "h", cadence: "daily" as GoalCadence },
];

function GoalsScreen() {
  useTheme();
  const goals = useGoals();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [cadence, setCadence] = useState<GoalCadence>("weekly");
  const [logging, setLogging] = useState<string | null>(null);
  const [value, setValue] = useState("");

  async function create(g: { key: string; label: string; target: number; unit: string; cadence: GoalCadence }) {
    try {
      await api.goals.upsert({ ...g, tone: TONES[(goals.data?.length ?? 0) % TONES.length] });
      goals.refetch();
      setAdding(false);
      setLabel(""); setTarget(""); setUnit("");
    } catch (e) {
      Alert.alert("Couldn't save goal", e instanceof Error ? e.message : "Try again.");
    }
  }

  if (goals.initialLoading) return <Screen><PageHeader title="Goals" /><PageSkeleton /></Screen>;
  const list = goals.data ?? [];
  const logGoal = list.find((g) => g.id === logging);

  return (
    <Screen>
      <PageHeader title="Goals" subtitle="Daily and weekly targets." right={<Chip label="Add" active onPress={() => setAdding(true)} />} />
      {list.length === 0 ? <EmptyState title="No goals yet" body="Add a target to track." action="Add a goal" onAction={() => setAdding(true)} /> : null}
      {list.map((g) => {
        const tone = (TONES.includes(g.tone as Tone) ? g.tone : "pink") as Tone;
        return (
          <Card key={g.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text variant="heading" style={{ fontSize: 17 }}>{g.label}</Text>
              <Label>{g.cadence.toUpperCase()}</Label>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginVertical: 8 }}>
              <Num size={28}>{g.current}</Num>
              <Text color="tertiary">/ {g.target} {g.unit}{g.completed ? " · done" : ""}</Text>
            </View>
            <ProgressBar pct={g.target ? (g.current / g.target) * 100 : 0} tone={tone} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Chip label="Log" onPress={() => { setLogging(g.id); setValue(""); }} />
              <Chip label="Remove" onPress={() => Alert.alert("Remove goal?", g.label, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: async () => { await api.goals.remove(g.id).catch(() => {}); goals.refetch(); } }])} />
            </View>
          </Card>
        );
      })}

      <Sheet visible={adding} onClose={() => setAdding(false)} title="New goal">
        <SectionHeading title="Quick picks" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PRESETS.map((p) => <Chip key={p.key} label={p.label} onPress={() => create(p)} />)}
        </View>
        <SectionHeading title="Custom" />
        <Field label="name" value={label} onChangeText={setLabel} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="target" value={target} onChangeText={setTarget} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="unit" value={unit} onChangeText={setUnit} /></View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Daily" active={cadence === "daily"} onPress={() => setCadence("daily")} />
          <Chip label="Weekly" active={cadence === "weekly"} onPress={() => setCadence("weekly")} />
        </View>
        <Button label="Save goal" disabled={!label.trim() || !parseFloat(target)} onPress={() => create({ key: label.trim().toLowerCase().replace(/\s+/g, "-"), label: label.trim(), target: parseFloat(target), unit: unit.trim() || "×", cadence })} />
      </Sheet>

      <Sheet visible={!!logGoal} onClose={() => setLogging(null)} title={logGoal ? `Log ${logGoal.label}` : ""}>
        <Field label={`value (${logGoal?.unit ?? ""})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Button label="Add" variant="ghost" onPress={async () => { const n = parseFloat(value); if (logGoal && n) { await api.goals.log(logGoal.id, n, "increment").catch(() => {}); goals.refetch(); setLogging(null); } }} /></View>
          <View style={{ flex: 1 }}><Button label="Set" onPress={async () => { const n = parseFloat(value); if (logGoal && !Number.isNaN(n)) { await api.goals.log(logGoal.id, n, "set").catch(() => {}); goals.refetch(); setLogging(null); } }} /></View>
        </View>
      </Sheet>
    </Screen>
  );
}

export default gated("goals", GoalsScreen);
