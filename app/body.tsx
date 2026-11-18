import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";
import { api } from "@/api/client";
import { useMuscleBalance, useMuscleMap, useResource } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import type { MuscleDetail, MuscleMap } from "@/api/types";
import { fromKg, unitLabel } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { gated } from "@/components/feature-gate";
import { colors } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { ProgressBar } from "@/components/ui/controls";
import { AreaChart, Card, EmptyState, PageHeader, PageSkeleton, Segmented, Sheet } from "@/components/ui/extra";
import { Label, Text } from "@/components/ui/text";

const RAMP = ["#4A3A47", "#FEE2E2", "#FCA5A5", "#EF4444", "#B91C1C", "#7F1D1D"];
const heat = (t: number) => RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1))))];

/** Schematic body: each region is a block coloured by training load (0–1). */
function BodyDiagram({ load, onPick }: { load: Record<string, number>; onPick: (key: string) => void }) {
  const R = (key: string, x: number, y: number, w: number, h: number, r = 10) => (
    <Rect key={key} x={x} y={y} width={w} height={h} rx={r} fill={heat(load[key] ?? 0)} onPress={() => onPick(key)} />
  );
  return (
    <Svg width="100%" height={360} viewBox="0 0 200 360">
      <Circle cx={100} cy={22} r={16} fill="rgba(255,255,255,0.16)" />
      {R("shoulders", 54, 44, 92, 18, 9)}
      {R("chest", 70, 64, 60, 34)}
      {R("abs", 78, 100, 44, 54)}
      {R("biceps", 38, 66, 20, 44)}
      {R("biceps-r", 142, 66, 20, 44)}
      {R("forearms", 32, 112, 18, 48)}
      {R("forearms-r", 150, 112, 18, 48)}
      {R("quads", 66, 160, 30, 78)}
      {R("quads-r", 104, 160, 30, 78)}
      {R("calves", 68, 244, 24, 70)}
      {R("calves-r", 108, 244, 24, 70)}
    </Svg>
  );
}

function BodyScreen() {
  useTheme();
  const { user } = useAuth();
  const units = user?.unitPreference ?? "imperial";
  const [range, setRange] = useState<MuscleMap["range"]>("week");
  const map = useMuscleMap(range);
  const bal = useMuscleBalance();
  const [key, setKey] = useState<string | null>(null);
  const detail = useResource<MuscleDetail | null>(`muscle:${key}`, () => (key ? api.body.muscle(key.replace(/-r$/, ""), 30) : Promise.resolve(null)));

  const load: Record<string, number> = {};
  for (const m of map.data?.muscles ?? []) {
    load[m.key] = m.score;
    load[`${m.key}-r`] = m.score; // mirror right side for paired regions
  }
  const max = Math.max(1, ...Object.values(load));
  const norm = Object.fromEntries(Object.entries(load).map(([k, v]) => [k, v / max]));

  if (map.initialLoading) return <Screen><PageHeader title="Body" /><PageSkeleton /></Screen>;

  return (
    <Screen>
      <PageHeader title="Muscle map" subtitle="Where your training load landed." />
      <Segmented value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
      <View style={{ marginVertical: 14, alignItems: "center" }}>
        {(map.data?.muscles ?? []).length === 0 ? <EmptyState title="No data in this range" body="Train a few muscle groups and they light up here." /> : <BodyDiagram load={norm} onPick={setKey} />}
      </View>

      <Card title="Most trained">
        {(bal.data?.mostTrained ?? []).map((m) => (
          <Pressable key={m.key} onPress={() => setKey(m.key)} style={{ marginBottom: 10, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text>{m.name}</Text><Label>{m.region}</Label></View>
            <ProgressBar pct={Math.min(100, m.load)} tone="pink" height={6} />
          </Pressable>
        ))}
      </Card>
      <Card title="Needs attention">
        {(bal.data?.undertrained ?? []).length === 0 ? <Text color="secondary">Everything's getting work.</Text> : null}
        {(bal.data?.undertrained ?? []).map((m) => (
          <Pressable key={m.key} onPress={() => setKey(m.key)} style={{ marginBottom: 10, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text>{m.name}</Text><Label>{m.region}</Label></View>
            <ProgressBar pct={Math.min(100, m.load)} tone="cyan" height={6} />
          </Pressable>
        ))}
      </Card>

      <Sheet visible={!!key} onClose={() => setKey(null)} title={detail.data?.name ?? "Muscle"}>
        {detail.data ? (
          <>
            <Text variant="meta" color="tertiary">{detail.data.anatomicalName} · {detail.data.region}</Text>
            <Text color="secondary">{detail.data.sessionsHit} sessions in the last 30 days</Text>
            <AreaChart series={[{ color: colors.pink, data: detail.data.activitySeries.map((a) => a.score) }]} height={100} />
            <Label>RECENT EXERCISES</Label>
            {detail.data.recentExercises.map((e, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                <Text style={{ flex: 1 }}>{e.name}</Text>
                <Text color="tertiary">{e.topSet.weightKg != null ? `${fromKg(e.topSet.weightKg, units)} ${unitLabel(units)}` : "BW"} × {e.topSet.reps ?? "—"}</Text>
              </View>
            ))}
          </>
        ) : <Text color="tertiary">Loading…</Text>}
      </Sheet>
    </Screen>
  );
}

export default gated("body_map", BodyScreen);
