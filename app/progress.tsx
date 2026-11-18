import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { api } from "@/api/client";
import { invalidateResource, useConsistency, useProgressOverview, useReadiness, useResource } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import type { BodyMeasurement, PersonalRecord, RecoveryCheckinInput } from "@/api/types";
import { fromKg, unitLabel } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { gated } from "@/components/feature-gate";
import { colors, fonts } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, ProgressBar, SectionHeading } from "@/components/ui/controls";
import { AreaChart, Card, Dial, EmptyState, MiniBars, PageHeader, PageSkeleton, Segmented, Sparkline } from "@/components/ui/extra";
import { Label, Num, Text } from "@/components/ui/text";

const RANGES = [
  { value: "4", label: "4w" },
  { value: "13", label: "13w" },
  { value: "26", label: "26w" },
] as const;

function Scale({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={String(n)} active={value === n} onPress={() => onChange(n)} />)}
      </View>
    </View>
  );
}

function CheckinCard() {
  const readiness = useReadiness();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<RecoveryCheckinInput>({ sleepQuality: 3, fatigue: 3, soreness: 3 });
  const [sleep, setSleep] = useState("7.5");
  const [busy, setBusy] = useState(false);
  const r = readiness.data;
  return (
    <Card title="Recovery">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Dial pct={r?.score ?? 0} size={104} tone="pink"><Num size={26}>{r ? r.score : "—"}</Num></Dial>
        <View style={{ flex: 1, gap: 8 }}>
          <Text color="secondary">{r?.recommendation ?? "Log a check-in to score your readiness."}</Text>
        </View>
      </View>
      {r?.factors?.map((x) => (
        <View key={x.label} style={{ marginTop: 10, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text variant="meta" color="secondary">{x.label}</Text><Text variant="meta" color="tertiary">{x.value}</Text></View>
          <ProgressBar pct={x.fraction * 100} tone="cyan" height={5} />
        </View>
      ))}
      <View style={{ marginTop: 14 }}>
        {open ? (
          <View style={{ gap: 12 }}>
            <View style={{ gap: 6 }}>
              <Label>SLEEP (HOURS)</Label>
              <TextInput value={sleep} onChangeText={setSleep} keyboardType="decimal-pad" style={{ height: 46, borderRadius: 14, backgroundColor: colors.surfaceRecessed, color: colors.textPrimary, paddingHorizontal: 14, fontFamily: fonts.num, fontSize: 16 }} />
            </View>
            <Scale label="SLEEP QUALITY" value={f.sleepQuality ?? 3} onChange={(n) => setF({ ...f, sleepQuality: n })} />
            <Scale label="FATIGUE" value={f.fatigue ?? 3} onChange={(n) => setF({ ...f, fatigue: n })} />
            <Scale label="SORENESS" value={f.soreness ?? 3} onChange={(n) => setF({ ...f, soreness: n })} />
            <Button label="Save check-in" loading={busy} onPress={async () => {
              setBusy(true);
              try {
                const res = await api.progress.checkin({ ...f, sleepH: parseFloat(sleep) || undefined });
                readiness.mutate(res.readiness);
                invalidateResource("dashboard");
                setOpen(false);
              } finally { setBusy(false); }
            }} />
          </View>
        ) : (
          <Button label="Daily check-in" variant="ghost" onPress={() => setOpen(true)} />
        )}
      </View>
    </Card>
  );
}

function ProgressScreen() {
  useTheme();
  const { user } = useAuth();
  const units = user?.unitPreference ?? "imperial";
  const u = unitLabel(units);
  const [weeks, setWeeks] = useState<"4" | "13" | "26">("13");
  const overview = useProgressOverview();
  const cons = useConsistency(Number(weeks));
  const prs = useResource<PersonalRecord[]>("prs", () => api.progress.personalRecords());
  const load = useResource("training-load", () => api.progress.trainingLoad());
  const patterns = useResource("patterns", () => api.progress.patterns());
  const corr = useResource("nutrition-corr", () => api.progress.nutritionCorrelation());
  const meas = useResource<BodyMeasurement[]>("measurements", () => api.progress.measurements());
  const [lift, setLift] = useState<string | null>(null);

  const liftOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of prs.data ?? []) if (p.exercise && !seen.has(p.exercise.slug)) seen.set(p.exercise.slug, p.exercise.name);
    return [...seen.entries()];
  }, [prs.data]);
  const slug = lift ?? liftOptions[0]?.[0] ?? null;
  const strength = useResource(`strength:${slug}`, () => (slug ? api.progress.strength(slug, 180) : Promise.resolve(null)));

  if (overview.initialLoading && cons.initialLoading) return <Screen><PageHeader title="Progress" /><PageSkeleton /></Screen>;
  const c = cons.data;
  const noData = !overview.data?.sessions;

  return (
    <Screen>
      <PageHeader title="Your trends" subtitle={overview.data?.summary} />
      {noData ? <EmptyState title="Nothing to chart yet" body="Finish a workout and your trends appear here." /> : null}

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        {[
          { l: "SESSIONS", v: String(overview.data?.sessions ?? 0) },
          { l: `VOLUME (${u})`, v: `${Math.round(fromKg(overview.data?.totalVolumeKg ?? 0, units) / 1000)}k` },
          { l: "PRS", v: String(overview.data?.personalRecords ?? 0) },
        ].map((s) => (
          <Card key={s.l} style={{ flex: 1, marginBottom: 0, padding: 14 }}><Label>{s.l}</Label><Num size={24} style={{ marginTop: 6 }}>{s.v}</Num></Card>
        ))}
      </View>

      <CheckinCard />

      <Card title="Consistency">
        <Segmented value={weeks} onChange={setWeeks} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
        {c ? (
          <View style={{ marginTop: 14, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
              <View style={{ alignItems: "center", gap: 4 }}><Label>STREAK</Label><Num size={24}>{c.currentStreak}</Num></View>
              <View style={{ alignItems: "center", gap: 4 }}><Label>ADHERENCE</Label><Num size={24}>{Math.round(c.adherence * 100)}%</Num></View>
              <View style={{ alignItems: "center", gap: 4 }}><Label>TARGET</Label><Num size={24}>{c.target}/wk</Num></View>
            </View>
            <MiniBars data={c.weeks.map((w) => w.sessions)} height={64} />
            <Text variant="meta" color="tertiary">Sessions per week</Text>
            <AreaChart series={[{ color: colors.cyan, data: c.weeks.map((w) => w.volumeKg) }]} height={110} />
            <Text variant="meta" color="tertiary">Weekly volume</Text>
          </View>
        ) : null}
      </Card>

      <Card title="Strength">
        {liftOptions.length === 0 ? <Text color="secondary">Log some sets and your estimated 1RM trend shows here.</Text> : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {liftOptions.slice(0, 8).map(([s, n]) => <Chip key={s} label={n} active={slug === s} onPress={() => setLift(s)} />)}
            </View>
            {strength.data?.series.length ? (
              <>
                <AreaChart series={[{ color: colors.pink, data: strength.data.series.map((p) => fromKg(p.e1rm, units)) }]} height={140} />
                <Text variant="meta" color="tertiary">Estimated 1RM ({u}) · latest {fromKg(strength.data.series.at(-1)!.e1rm, units)}</Text>
              </>
            ) : <Text color="tertiary">No data for this lift yet.</Text>}
          </View>
        )}
      </Card>

      {load.data ? (
        <Card title="Training load">
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            <View style={{ alignItems: "center", gap: 4 }}><Label>FITNESS</Label><Num size={22}>{Math.round(load.data.ctl)}</Num></View>
            <View style={{ alignItems: "center", gap: 4 }}><Label>FATIGUE</Label><Num size={22}>{Math.round(load.data.atl)}</Num></View>
            <View style={{ alignItems: "center", gap: 4 }}><Label>FORM</Label><Num size={22}>{Math.round(load.data.tsb)}</Num></View>
          </View>
          <Text color="secondary" style={{ marginTop: 10 }}>Status: {load.data.status}</Text>
          <Sparkline data={load.data.weeklyTrimp} width={280} height={44} color={colors.cyan} />
        </Card>
      ) : null}

      {patterns.data && !patterns.data.insufficient_data ? (
        <Card title="Patterns">
          {patterns.data.insight ? <Text color="secondary">{patterns.data.insight}</Text> : null}
          {patterns.data.bestDay ? <Text variant="meta" color="tertiary" style={{ marginTop: 6 }}>Best day: {patterns.data.bestDay}{patterns.data.bestTimeWindow ? ` · ${patterns.data.bestTimeWindow}` : ""}</Text> : null}
        </Card>
      ) : null}

      {corr.data && !corr.data.insufficient_data ? (
        <Card title="Nutrition ↔ strength"><Text color="secondary">{corr.data.interpretation}</Text></Card>
      ) : null}

      <SectionHeading title="Body measurements" />
      <Card>
        {(meas.data ?? []).length === 0 ? <Text color="secondary">No measurements yet. Log your weight in the training profile.</Text> : (
          <>
            <Sparkline data={[...(meas.data ?? [])].filter((m) => m.weightKg).map((m) => fromKg(m.weightKg!, units))} width={280} height={50} />
            <Text variant="meta" color="tertiary">Bodyweight trend ({u})</Text>
          </>
        )}
      </Card>
    </Screen>
  );
}

export default gated("progress_basic", ProgressScreen);
