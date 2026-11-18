import { useMemo, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/api/client";
import { useAchievements, useResource } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import type { PersonalRecord } from "@/api/types";
import { fromKg, unitLabel } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { colors } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Chip, ProgressBar, SectionHeading } from "@/components/ui/controls";
import { Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui/extra";
import { RaisedSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";

const TYPE_LABEL: Record<string, string> = { max_weight: "Heaviest set", max_1rm_estimate: "Est. 1RM", max_reps: "Most reps", max_volume: "Best volume" };

export default function Records() {
  useTheme();
  const { user } = useAuth();
  const units = user?.unitPreference ?? "imperial";
  const u = unitLabel(units);
  const prs = useResource<PersonalRecord[]>("prs", () => api.progress.personalRecords());
  const ach = useAchievements();
  const [type, setType] = useState<string>("all");

  const list = useMemo(() => (prs.data ?? []).filter((p) => type === "all" || p.recordType === type).sort((a, b) => Date.parse(b.achievedAt) - Date.parse(a.achievedAt)), [prs.data, type]);
  const fmt = (p: PersonalRecord) => (p.recordType === "max_reps" ? `${p.value} reps` : `${Math.round(fromKg(p.value, units))} ${u}`);

  if (prs.initialLoading) return <Screen><PageHeader title="Records" /><PageSkeleton /></Screen>;

  return (
    <Screen>
      <PageHeader title="Records" subtitle="Personal bests and achievements." />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <Chip label="All" active={type === "all"} onPress={() => setType("all")} />
        {Object.entries(TYPE_LABEL).map(([k, v]) => <Chip key={k} label={v} active={type === k} onPress={() => setType(k)} />)}
      </View>

      {list.length === 0 ? <EmptyState title="No records yet" body="Hit a new best in a workout and it lands here." /> : null}
      {list.map((p, i) => (
        <RaisedSurface key={p.id} radiusSize="large" style={{ padding: 16, marginBottom: 10, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text variant="heading" style={{ fontSize: 17 }}>{p.exercise?.name ?? "Exercise"}</Text>
              <Label>{TYPE_LABEL[p.recordType] ?? p.recordType} · {new Date(p.achievedAt).toLocaleDateString()}</Label>
            </View>
            <Num size={24} style={{ color: i === 0 ? colors.lime : colors.textPrimary }}>{fmt(p)}</Num>
          </View>
          {p.previousValue != null ? <Text variant="meta" color="tertiary">Previous {p.recordType === "max_reps" ? p.previousValue : Math.round(fromKg(p.previousValue, units))}</Text> : null}
        </RaisedSurface>
      ))}

      <SectionHeading title="Achievements" />
      {(ach.data ?? []).map((a) => {
        const done = !!a.unlockedAt;
        const pct = a.targetValue ? (a.progress / a.targetValue) * 100 : done ? 100 : 0;
        return (
          <Card key={a.key} style={{ marginBottom: 10, opacity: done ? 1 : 0.85 }}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Ionicons name={done ? "trophy" : "trophy-outline"} size={22} color={done ? colors.amber : colors.textTertiary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text>{a.title}</Text>
                <Text variant="meta" color="tertiary">{a.detail}</Text>
              </View>
            </View>
            {!done && a.targetValue ? <View style={{ marginTop: 10 }}><ProgressBar pct={pct} tone="amber" height={5} /></View> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
