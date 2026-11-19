/**
 * Body (website: pages/Body.tsx) — muscle map with front/back views, an
 * Activation (load in range) or Fatigue (recent load → recovery) overlay,
 * a ranked list, balance highlights and a per-muscle detail sheet.
 *
 * The map is the website's `body-muscles` anatomy (70+ muscles) rendered with
 * react-native-svg — see components/body-muscles.tsx.
 */
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { BodyMuscles, FATIGUE_STOPS, HEAT_STOPS } from "@/components/body-muscles";
import { api } from "@/api/client";
import { errorMessage, useMuscleBalance, useMuscleMap, useResource } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import type { MuscleDetail, MuscleMap } from "@/api/types";
import { fromKg, unitLabel } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { gated } from "@/components/feature-gate";
import { colors } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { ProgressBar } from "@/components/ui/controls";
import { AreaChart, Card, EmptyState, ErrorState, PageHeader, PillTabs, Segmented, Sheet, Skel } from "@/components/ui/extra";
import { Label, Text } from "@/components/ui/text";

const ACT = HEAT_STOPS;
const FAT = FATIGUE_STOPS;

function BodyScreen() {
  useTheme();
  const { user } = useAuth();
  const units = user?.unitPreference ?? "imperial";
  const [range, setRange] = useState<MuscleMap["range"]>("week");
  const [mode, setMode] = useState<"activation" | "fatigue">("activation");
  const [view, setView] = useState<"front" | "back">("front");
  const map = useMuscleMap(mode === "fatigue" ? "week" : range);
  const today = useMuscleMap("today");
  const bal = useMuscleBalance();
  const [key, setKey] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const detail = useResource<MuscleDetail | null>(`muscle:${key}`, () => (key ? api.body.muscle(key, 30) : Promise.resolve(null)));

  const rows = useMemo(() => map.data?.muscles ?? [], [map.data]);
  const values = useMemo(() => {
    const out: Record<string, number> = {};
    const max = Math.max(0.0001, ...rows.map((m) => m.score));
    for (const m of rows) out[m.key] = m.score / max;
    if (mode === "fatigue") for (const m of today.data?.muscles ?? []) out[m.key] = Math.min(1, (out[m.key] ?? 0) * 0.6 + m.score * 1.2);
    return out;
  }, [rows, mode, today.data]);
  const ranked = [...rows].filter((m) => m.score > 0).sort((a, b) => b.score - a.score);
  const legend = mode === "fatigue" ? [["Recovered", FAT[0]], ["Moderate", FAT[3]], ["Fatigued", FAT[5]]] : [["Rest", ACT[0]], ["Light", ACT[2]], ["Heavy", ACT[4]]];

  return (
    <Screen onRefresh={() => Promise.all([map.reload(), bal.reload(), today.reload()])}>
      <PageHeader title="Muscle map" subtitle={mode === "fatigue" ? "How recovered each muscle is, from your last 7 days." : "Where your training load landed."} />
      <View style={{ gap: 10 }}>
        <Segmented value={mode} onChange={setMode} options={[{ value: "activation", label: "Activation" }, { value: "fatigue", label: "Fatigue" }]} />
        {mode === "activation" ? <PillTabs value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} /> : null}
      </View>

      <Card style={{ marginTop: 14, alignItems: "center" }}>
        <View style={{ alignSelf: "stretch" }}><PillTabs value={view} onChange={setView} options={[{ value: "front", label: "Front" }, { value: "back", label: "Back" }]} /></View>
        {map.initialLoading ? <Skel h={320} r={24} style={{ marginTop: 10 }} /> : map.error && !map.data ? <ErrorState message={errorMessage(map.error)} onRetry={map.refetch} /> : (
          <>
            <BodyMuscles activation={values} view={view} stops={mode === "fatigue" ? FAT : ACT} selectedGroup={key} onSelect={(group, name) => { setPickedName(name); if (group && rows.some((m) => m.key === group)) setKey(group); }} />
            <Text variant="meta" color="secondary" style={{ minHeight: 18, marginTop: 6 }}>{pickedName ?? ""}</Text>
            <View style={{ flexDirection: "row", gap: 16 }}>
              {legend.map(([l, c]) => (
                <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} /><Text variant="meta" color="tertiary">{l}</Text></View>
              ))}
            </View>
            <Text variant="meta" color="tertiary" style={{ marginTop: 8 }}>Tap a muscle for its history.</Text>
          </>
        )}
      </Card>

      <Card title={`Ranked · ${mode === "fatigue" ? "last 7 days" : range}`}>
        {ranked.length === 0 ? <EmptyState title="Nothing trained yet" body="Finish a session and your worked muscles rank here by load." /> : ranked.map((m) => (
          <Pressable key={m.key} onPress={() => setKey(m.key)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
            <Text style={{ width: 100 }} numberOfLines={1}>{m.name}</Text>
            <View style={{ flex: 1 }}><ProgressBar pct={(values[m.key] ?? 0) * 100} tone={mode === "fatigue" ? "amber" : "mauve"} height={8} /></View>
            <Text variant="meta" color="tertiary" style={{ width: 40, textAlign: "right" }}>{Math.round(m.score * 100)}%</Text>
          </Pressable>
        ))}
      </Card>

      {(bal.data?.undertrained ?? []).length ? (
        <Card title="Undertrained">
          <Text variant="meta" color="tertiary" style={{ marginBottom: 6 }}>Muscles getting the least work lately — worth adding next session.</Text>
          {bal.data!.undertrained.map((m) => (
            <Pressable key={m.key} onPress={() => setKey(m.key)} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
              <Text>{m.name}</Text>
              <Label>{m.region.toUpperCase()}</Label>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Sheet visible={!!key} onClose={() => setKey(null)} title={detail.data?.name ?? (key ? rows.find((m) => m.key === key)?.name ?? key.replace(/_/g, " ") : "Muscle")} eyebrow={detail.data ? `${detail.data.anatomicalName} · ${detail.data.region}` : undefined}>
        {detail.data ? (
          <>
            <Text color="secondary">{detail.data.sessionsHit} session{detail.data.sessionsHit === 1 ? "" : "s"} in the last 30 days</Text>
            {detail.data.activitySeries.length >= 2 ? <AreaChart series={[{ color: colors.pink, data: detail.data.activitySeries.map((a) => a.score) }]} height={100} /> : null}
            <Label>RECENT EXERCISES</Label>
            {detail.data.recentExercises.length === 0 ? <Text color="tertiary">No recent exercises for this muscle.</Text> : detail.data.recentExercises.map((e, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 10 }}>
                <Text style={{ flex: 1 }} numberOfLines={1}>{e.name}</Text>
                <Text color="tertiary">{e.topSet.weightKg != null ? `${fromKg(e.topSet.weightKg, units)} ${unitLabel(units)}` : "BW"} × {e.topSet.reps ?? "—"}</Text>
              </View>
            ))}
          </>
        ) : detail.error ? <Text color="secondary">Couldn't load this muscle.</Text> : <Skel h={120} r={20} />}
      </Sheet>
    </Screen>
  );
}

export default gated("body_map", BodyScreen);
