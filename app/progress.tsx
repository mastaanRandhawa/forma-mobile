import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useConsistency, useMuscleMap, useProgressOverview, useReadiness, useResource } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import type { BodyMeasurement, PersonalRecord } from "@/api/types";
import { CheckinSheet, useCheckins, useTodayCheckin } from "@/components/checkin";
import { toast } from "@/components/ui/toast";
import { fromKg, toKg, unitLabel } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { gated } from "@/components/feature-gate";
import { colors, fonts } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, ProgressBar, SectionHeading } from "@/components/ui/controls";
import { AreaChart, Card, Dial, EmptyState, MiniBars, PageHeader, PageSkeleton, PillTabs, ScrubChart, Segmented, Sheet, Sparkline } from "@/components/ui/extra";
import { Label, Num, Text } from "@/components/ui/text";
import { YearHeatmap } from "@/components/year-heatmap";
import { liftBalance } from "@/lib/lift-balance";
import { setDevicePrefs, useDevicePrefs } from "@/lib/device-prefs";
import { Quiet } from "@/components/quiet";

const RANGES = [
  { value: "4", label: "4w" },
  { value: "13", label: "13w" },
  { value: "26", label: "26w" },
] as const;

function CheckinCard() {
  const readiness = useReadiness();
  const today = useTodayCheckin();
  const checkins = useCheckins();
  const [open, setOpen] = useState(false);
  const r = readiness.data;
  const sleep = [...(checkins.data ?? [])].sort((x, y) => Date.parse(x.recordedAt) - Date.parse(y.recordedAt)).slice(-14).map((c) => c.sleepH ?? 0).filter(Boolean);
  return (
    <Card title="Recovery">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Dial pct={r?.score ?? 0} size={104} tone="pink"><Num size={26}>{r ? r.score : "—"}</Num></Dial>
        <View style={{ flex: 1, gap: 6 }}>
          <Text color="secondary">{r?.recommendation ?? "Log a check-in to score your readiness."}</Text>
          {today.latest ? <Text variant="meta" color="tertiary">{today.latest.sleepH ?? "—"}h sleep · quality {today.latest.sleepQuality ?? "—"}/5 · fatigue {today.latest.fatigue ?? "—"}/5 · soreness {today.latest.soreness ?? "—"}/5</Text> : null}
        </View>
      </View>
      {r?.factors?.map((x) => (
        <View key={x.label} style={{ marginTop: 10, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text variant="meta" color="secondary">{x.label}</Text><Text variant="meta" color="tertiary">{x.value}</Text></View>
          <ProgressBar pct={x.fraction * 100} tone="cyan" height={5} />
        </View>
      ))}
      {sleep.length >= 2 ? <View style={{ marginTop: 12 }}><Label>SLEEP · LAST {sleep.length} CHECK-INS</Label><ScrubChart data={sleep} unit="h" color={colors.cyan} height={80} /></View> : null}
      <View style={{ marginTop: 14 }}>
        <Button label={today.done ? "Update check-in" : "Daily check-in"} variant="ghost" onPress={() => setOpen(true)} />
      </View>
      <CheckinSheet visible={open} onClose={() => setOpen(false)} seed={today.latest} onSaved={(nr) => { readiness.mutate(nr); today.refetch(); checkins.refetch(); }} />
    </Card>
  );
}

const STRENGTH_RANGES = [
  { value: "30", label: "1M" },
  { value: "91", label: "3M" },
  { value: "182", label: "6M" },
  { value: "365", label: "1Y" },
] as const;

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
  const [days, setDays] = useState<"30" | "91" | "182" | "365">("182");
  const muscles = useMuscleMap("month");
  const router = useRouter();
  const [measureOpen, setMeasureOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const dp = useDevicePrefs();
  const goalDisp = dp.weightGoalKg != null ? fromKg(dp.weightGoalKg, units) : null;

  const liftOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of prs.data ?? []) if (p.exercise && !seen.has(p.exercise.slug)) seen.set(p.exercise.slug, p.exercise.name);
    return [...seen.entries()];
  }, [prs.data]);
  const slug = lift ?? liftOptions[0]?.[0] ?? null;
  const strength = useResource(`strength:${slug}:${days}`, () => (slug ? api.progress.strength(slug, Number(days)) : Promise.resolve(null)));

  if (overview.initialLoading && cons.initialLoading) return <Screen><PageHeader title="Progress" /><PageSkeleton /></Screen>;
  const c = cons.data;
  const noData = !overview.data?.sessions;

  return (
    <Screen onRefresh={() => Promise.all([overview.reload(), cons.reload(), prs.reload(), load.reload(), patterns.reload(), corr.reload(), meas.reload(), muscles.reload(), strength.reload()])}>
      <PageHeader title="Your trends" subtitle={overview.data?.summary} />
      {noData ? <EmptyState title="Nothing to chart yet" body="Finish a workout and your trends appear here." /> : null}

      <Quiet widgetKey="progress-stats"><View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
        {[
          { l: "SESSIONS", v: String(overview.data?.sessions ?? 0) },
          { l: `VOLUME (${u})`, v: (() => { const v = fromKg(overview.data?.totalVolumeKg ?? 0, units); return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)); })() },
          { l: "PRS", v: String(overview.data?.personalRecords ?? 0) },
        ].map((s) => (
          <Card key={s.l} style={{ flex: 1, marginBottom: 0, padding: 14 }}><Label>{s.l}</Label><Num size={24} style={{ marginTop: 6 }}>{s.v}</Num></Card>
        ))}
      </View></Quiet>

      <CheckinCard />

      <Card title="Consistency">
        <Segmented value={weeks} onChange={setWeeks} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
        {c ? (
          <Quiet widgetKey="progress-consistency"><View style={{ marginTop: 14, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
              <View style={{ alignItems: "center", gap: 4 }}><Label>STREAK</Label><Num size={24}>{c.currentStreak}</Num></View>
              <View style={{ alignItems: "center", gap: 4 }}><Label>ADHERENCE</Label><Num size={24}>{Math.round(c.adherence * 100)}%</Num></View>
              <View style={{ alignItems: "center", gap: 4 }}><Label>TARGET</Label><Num size={24}>{c.target}/wk</Num></View>
            </View>
            <MiniBars data={c.weeks.map((w) => w.sessions)} height={64} />
            <Text variant="meta" color="tertiary">Sessions per week</Text>
            <AreaChart series={[{ color: colors.cyan, data: c.weeks.map((w) => w.volumeKg) }]} height={110} />
            <Text variant="meta" color="tertiary">Weekly volume</Text>
          </View></Quiet>
        ) : null}
      </Card>

      <Card title="Last 12 months">
        <YearHeatmap />
      </Card>

      <Card title="Strength">
        {liftOptions.length === 0 ? <Text color="secondary">Log some sets and your estimated 1RM trend shows here.</Text> : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {liftOptions.slice(0, 8).map(([s, n]) => <Chip key={s} label={n} active={slug === s} onPress={() => setLift(s)} />)}
            </View>
            <PillTabs value={days} onChange={setDays} options={STRENGTH_RANGES.map((r) => ({ value: r.value, label: r.label }))} />
            {strength.data && strength.data.series.length >= 2 ? (
              <Quiet widgetKey="progress-strength">
                <ScrubChart data={strength.data.series.map((p) => fromKg(p.e1rm, units))} labels={strength.data.series.map((p) => new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }))} unit={u} height={150} />
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                  <Num size={28}>{fromKg(strength.data.series.at(-1)!.e1rm, units)}</Num>
                  <Text color="tertiary">{u} est. 1RM</Text>
                  {(() => { const d0 = fromKg(strength.data!.series.at(-1)!.e1rm - strength.data!.series[0].e1rm, units); return <Text variant="meta" style={{ marginLeft: "auto", color: d0 >= 0 ? colors.lime : colors.amber }}>{d0 >= 0 ? "+" : ""}{Math.round(d0 * 10) / 10} {u} over {STRENGTH_RANGES.find((r) => r.value === days)?.label}</Text>; })()}
                </View>
                <Text variant="meta" color="tertiary">Drag across the chart to read a point. Epley formula.</Text>
              </Quiet>
            ) : <Text color="tertiary">Need at least two sessions with this lift in this range.</Text>}
          </View>
        )}
      </Card>

      {(() => {
        const bal = liftBalance(prs.data ?? []);
        if (!bal) return null;
        return (
          <Card title="Lift ratios">
            <Quiet widgetKey="progress-ratios">
              <View style={{ gap: 14 }}>
                {bal.rows.map((r) => (
                  <View key={r.lift.key} style={{ gap: 5 }}>
                    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                      <Text>{r.lift.label}</Text>
                      <Text variant="meta" style={{ color: r.status === "below" ? colors.amber : r.status === "within" ? colors.lime : colors.textSecondary }}>
                        {r.ratio == null ? `${Math.round(fromKg(r.e1rmKg, units))} ${u} est. 1RM` : `${r.ratio.toFixed(2)}× bench · usual ${r.lift.lo}–${r.lift.hi}×`}
                      </Text>
                    </View>
                    {r.ratio != null ? <ProgressBar pct={Math.min(100, (r.ratio / (r.lift.hi * 1.25)) * 100)} tone={r.status === "below" ? "amber" : "lime"} height={5} /> : null}
                  </View>
                ))}
                <Text variant="meta" color="tertiary">
                  {bal.weakest ? `${bal.weakest.label} is your weakest link against your bench.` : "Your lifts sit in a balanced range against your bench."} A rough guide from estimated 1RMs on barbell lifts, not a prescription.
                </Text>
              </View>
            </Quiet>
          </Card>
        );
      })()}

      <Card title="Personal records">
        {(prs.data ?? []).length === 0 ? <Text color="secondary">Beat a previous best on any lift and it lands here automatically.</Text> : (
          <>
            <Quiet widgetKey="progress-prs">{[...(prs.data ?? [])].filter((p) => p.recordType === "max_1rm_estimate" || p.recordType === "max_weight").sort((a, b) => Date.parse(b.achievedAt) - Date.parse(a.achievedAt)).slice(0, 6).map((p) => (
              <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 10 }}>
                <View style={{ flex: 1 }}><Text numberOfLines={1}>{p.exercise?.name ?? "Lift"}</Text><Text variant="meta" color="tertiary">{p.recordType === "max_weight" ? "Heaviest set" : "Est. 1RM"} · {new Date(p.achievedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text></View>
                <Num size={16} style={{ color: colors.lime }}>{Math.round(fromKg(p.value, units))} {u}</Num>
              </View>
            ))}</Quiet>
            <Pressable onPress={() => router.push("/records")} style={{ paddingTop: 10 }}><Text variant="meta" color="pink">View all records →</Text></Pressable>
          </>
        )}
      </Card>

      {(muscles.data?.muscles ?? []).some((m) => m.score > 0) ? (
        <Card title="Volume by muscle · 30 days">
          <Quiet widgetKey="progress-muscles">{[...(muscles.data?.muscles ?? [])].filter((m) => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 8).map((m) => (
            <View key={m.key} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 }}>
              <Text variant="meta" color="secondary" style={{ width: 96 }} numberOfLines={1}>{m.name}</Text>
              <View style={{ flex: 1 }}><ProgressBar pct={m.score * 100} tone="mauve" height={7} /></View>
              <Num size={12} color="tertiary" style={{ width: 36, textAlign: "right" }}>{Math.round(m.score * 100)}%</Num>
            </View>
          ))}</Quiet>
        </Card>
      ) : null}

      {load.data ? (
        <Card title="Training load"><Quiet widgetKey="progress-load">
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            <View style={{ alignItems: "center", gap: 4 }}><Label>FITNESS</Label><Num size={22}>{Math.round(load.data.ctl)}</Num></View>
            <View style={{ alignItems: "center", gap: 4 }}><Label>FATIGUE</Label><Num size={22}>{Math.round(load.data.atl)}</Num></View>
            <View style={{ alignItems: "center", gap: 4 }}><Label>FORM</Label><Num size={22}>{Math.round(load.data.tsb)}</Num></View>
          </View>
          <Text color="secondary" style={{ marginTop: 10 }}>Status: {load.data.status}</Text>
          <Sparkline data={load.data.weeklyTrimp} width={280} height={44} color={colors.cyan} />
        </Quiet></Card>
      ) : null}

      {patterns.data && !patterns.data.insufficient_data ? (
        <Card title="Patterns"><Quiet widgetKey="progress-patterns">
          {patterns.data.insight ? <Text color="secondary">{patterns.data.insight}</Text> : null}
          {patterns.data.bestDay ? <Text variant="meta" color="tertiary" style={{ marginTop: 6 }}>Best day: {patterns.data.bestDay}{patterns.data.bestTimeWindow ? ` · ${patterns.data.bestTimeWindow}` : ""}</Text> : null}
          {patterns.data.circadian.filter((b) => b.sessions >= 3).map((b) => (
            <View key={b.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
              <Text variant="meta" color="secondary">{b.label} · {b.sessions} sessions</Text>
              <Text variant="meta" style={{ color: b.relativePerformance >= 0 ? colors.lime : colors.amber }}>{b.relativePerformance > 0 ? "+" : ""}{b.relativePerformance}% vol</Text>
            </View>
          ))}
        </Quiet></Card>
      ) : null}

      {corr.data && !corr.data.insufficient_data ? (
        <Card title="Protein vs. volume"><Quiet widgetKey="progress-protein">
          <Text color="secondary">Correlation {corr.data.correlation} — {corr.data.interpretation}</Text>
          {corr.data.weeks.length >= 3 ? (
            <View style={{ marginTop: 10, gap: 4 }}>
              <MiniBars data={corr.data.weeks.slice(-8).map((w) => w.totalVolumeKg)} tone="cyan" height={48} />
              <Text variant="meta" color="tertiary">Weekly volume · avg protein {Math.round(corr.data.weeks.slice(-8).reduce((n, w) => n + w.avgProteinG, 0) / Math.min(8, corr.data.weeks.length))} g/day</Text>
            </View>
          ) : null}
        </Quiet></Card>
      ) : null}

      <SectionHeading title="Body measurements" action="+ Log" onAction={() => setMeasureOpen(true)} />
      <Card>
        {(meas.data ?? []).length === 0 ? (
          <View style={{ gap: 10 }}>
            <Text color="secondary">No measurements yet. Log your weight and a few tape measurements to see trends.</Text>
            <Button label="Log a measurement" variant="ghost" onPress={() => setMeasureOpen(true)} />
          </View>
        ) : (() => {
          const sorted = [...(meas.data ?? [])].sort((a, b) => Date.parse(a.recordedAt ?? "") - Date.parse(b.recordedAt ?? ""));
          const w = sorted.filter((m) => m.weightKg).map((m) => fromKg(m.weightKg!, units));
          const last = sorted[sorted.length - 1];
          return (
            <Quiet widgetKey="progress-body"><View style={{ gap: 10 }}>
              {w.length >= 2 ? <ScrubChart data={w} unit={u} height={110} goal={goalDisp} /> : null}
              {(() => {
                const now = w[w.length - 1];
                const toGo = goalDisp != null && now != null ? Math.round((goalDisp - now) * 10) / 10 : null;
                const text = goalDisp == null ? "Set a goal weight to draw it across the chart" : toGo === 0 ? `At your goal of ${goalDisp} ${u}` : toGo == null ? `Goal ${goalDisp} ${u}` : `Goal ${goalDisp} ${u} · ${Math.abs(toGo)} ${u} ${toGo < 0 ? "to lose" : "to gain"}`;
                return <Pressable onPress={() => setGoalOpen(true)} hitSlop={8} accessibilityLabel="Set goal weight"><Text variant="meta" color="pink">{text}{goalDisp != null ? " · edit" : ""}</Text></Pressable>;
              })()}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                {last?.weightKg ? <View><Num size={20}>{fromKg(last.weightKg, units)}</Num><Label>WEIGHT {u.toUpperCase()}</Label></View> : null}
                {last?.bodyFatPct ? <View><Num size={20}>{last.bodyFatPct}%</Num><Label>BODY FAT</Label></View> : null}
                {last?.waistCm ? <View><Num size={20}>{units === "metric" ? last.waistCm : Math.round((last.waistCm / 2.54) * 10) / 10}</Num><Label>WAIST {units === "metric" ? "CM" : "IN"}</Label></View> : null}
              </View>
              {last?.recordedAt ? <Text variant="meta" color="tertiary">Last logged {new Date(last.recordedAt).toLocaleDateString()}</Text> : null}
            </View></Quiet>
          );
        })()}
      </Card>
      <GoalWeightSheet visible={goalOpen} units={units} current={goalDisp} onClose={() => setGoalOpen(false)} />
      <MeasureSheet visible={measureOpen} units={units} onClose={() => setMeasureOpen(false)} onSaved={() => { setMeasureOpen(false); meas.refetch(); }} />
    </Screen>
  );
}

function GoalWeightSheet({ visible, units, current, onClose }: { visible: boolean; units: "metric" | "imperial"; current: number | null; onClose: () => void }) {
  const [v, setV] = useState("");
  const u = unitLabel(units);
  const n = parseFloat(v.replace(",", "."));
  const ok = Number.isFinite(n) && n > 0;
  return (
    <Sheet visible={visible} onClose={onClose} title="Goal weight" eyebrow="bodyweight">
      <Text color="secondary">Draws a dashed line on your bodyweight chart and shows how far you are from it. Kept on this device.</Text>
      <TextInput value={v} onChangeText={setV} keyboardType="decimal-pad" placeholder={current != null ? String(current) : `goal (${u})`} placeholderTextColor={colors.textTertiary} style={{ height: 52, borderRadius: 16, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.num, fontSize: 18 }} />
      <Button label="Save goal" disabled={!ok} onPress={() => { setDevicePrefs({ weightGoalKg: Math.round(toKg(n, units) * 10) / 10 }); setV(""); onClose(); }} />
      {current != null ? <Button label="Remove goal" variant="ghost" onPress={() => { setDevicePrefs({ weightGoalKg: null }); setV(""); onClose(); }} /> : null}
    </Sheet>
  );
}

function MeasureSheet({ visible, units, onClose, onSaved }: { visible: boolean; units: "metric" | "imperial"; onClose: () => void; onSaved: () => void }) {
  const metric = units === "metric";
  const [v, setV] = useState({ weight: "", bodyFat: "", waist: "", chest: "", arm: "" });
  const [busy, setBusy] = useState(false);
  const n = (s: string) => { const x = parseFloat(s.replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : undefined; };
  const cm = (s: string) => { const x = n(s); return x == null ? undefined : metric ? x : Math.round(x * 2.54 * 10) / 10; };
  const any = Object.values(v).some((x) => n(x) != null);
  const save = async () => {
    setBusy(true);
    try {
      const w = n(v.weight);
      await api.progress.addMeasurement({ weightKg: w != null ? toKg(w, units) : undefined, bodyFatPct: n(v.bodyFat), waistCm: cm(v.waist), chestCm: cm(v.chest), armCm: cm(v.arm) });
      if (w != null) await api.me.update({ weightKg: toKg(w, units) }).catch(() => {});
      invalidateResource("measurements");
      toast.success("Measurement logged");
      setV({ weight: "", bodyFat: "", waist: "", chest: "", arm: "" });
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(false);
    }
  };
  const row = (key: keyof typeof v, label: string, unit: string) => (
    <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <TextInput value={v[key]} onChangeText={(t) => setV((s) => ({ ...s, [key]: t }))} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textTertiary} style={{ width: 96, height: 44, borderRadius: 14, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 12, color: colors.textPrimary, fontFamily: fonts.num, fontSize: 16, textAlign: "right" }} />
      <Text color="tertiary" style={{ width: 28 }}>{unit}</Text>
    </View>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="Log measurement" eyebrow="Body" footer={<Button label="Save" variant="accent" loading={busy} disabled={!any} onPress={save} />}>
      <Text variant="meta" color="tertiary">Fill in whatever you measured today — everything is optional.</Text>
      {row("weight", "Bodyweight", metric ? "kg" : "lb")}
      {row("bodyFat", "Body fat", "%")}
      {row("waist", "Waist", metric ? "cm" : "in")}
      {row("chest", "Chest", metric ? "cm" : "in")}
      {row("arm", "Arm", metric ? "cm" : "in")}
    </Sheet>
  );
}

export default gated("progress_basic", ProgressScreen);
