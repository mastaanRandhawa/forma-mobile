/**
 * Home — one scrolling column in priority order:
 *   1 greeting + readiness (one compact component; tap a metric for its detail)
 *   2 today's workout, the primary focus
 *   3 weekly progress
 *   4 one Kai insight
 *   5 goals and recent records as previews that link to their screens
 * Volume detail lives in Progress; achievements live in Records.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useConsistency, useDashboard, useGoals, usePlannedWorkouts, useReadiness, useSessionHistory } from "@/api/hooks";
import { usePrefs, useProgression } from "@/api/settings";
import type { GoalWithProgress } from "@/api/types";
import { useAuth } from "@/auth/auth-provider";
import { fromKg, unitLabel } from "@/lib/workouts";
import { useEquippedItem, useTheme } from "@/theme/theme-provider";
import { colors, radius, type Tone } from "@/theme/tokens";
import { CheckinSheet, useCheckins, useTodayCheckin } from "@/components/checkin";
import { GoalLogSheet } from "@/components/goal-log";
import { Quiet } from "@/components/quiet";
import { useActiveSession } from "@/components/workout-bar";
import { Screen } from "@/components/ui/screen";
import { Button, ProgressBar, Ring, SectionHeading } from "@/components/ui/controls";
import { Card, EmptyState, ErrorState, MiniBars, RingValue, ScrubChart, Sheet, Skel } from "@/components/ui/extra";
import { Fill } from "@/components/ui/gradient";
import { PressScale } from "@/components/ui/pressable";
import { CountUp } from "@/components/ui/count-up";
import { toast } from "@/components/ui/toast";
import { KaiOrb, coachMood } from "@/components/ui/kai-orb";
import { ProfileMenu } from "@/components/profile-menu";
import { RecessedSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";

const DAY_MS = 864e5;
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const partOfDay = (h = new Date().getHours()) => (h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Winding down");
function weekStart(weeksAgo = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - weeksAgo * 7);
  return d;
}

type Detail = { id: string; eyebrow: string; title: string; value: string; unit: string; chart: number[]; mode: "bars" | "curve"; color: string; factors: { label: string; value: string; fraction: number }[]; recommendation: string; to: string };

export default function Dashboard() {
  useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const prog = useProgression();
  const prefs = usePrefs();
  const units = user?.unitPreference ?? "imperial";
  const u = unitLabel(units);
  const dash = useDashboard();
  const hist = useSessionHistory();
  const goals = useGoals();
  const readiness = useReadiness();
  const cons = useConsistency(13);
  const planned = usePlannedWorkouts();
  const checkins = useCheckins();
  const today = useTodayCheckin();
  const active = useActiveSession();
  const look = useEquippedItem("avatar")?.id;
  const d = dash.data;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [logGoal, setLogGoal] = useState<GoalWithProgress | null>(null);
  const [checkin, setCheckin] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const refresh = () => {
    invalidateResource();
    [dash, hist, goals, readiness, cons, planned, checkins, active].forEach((r) => r.refetch());
  };

  const sessions = useMemo(() => hist.data ?? [], [hist.data]);
  const trained = useMemo(() => {
    const start = weekStart(0).getTime();
    const out = new Array(7).fill(false);
    for (const s of sessions) {
      const i = Math.floor((new Date(s.startedAt).setHours(0, 0, 0, 0) - start) / DAY_MS);
      if (i >= 0 && i < 7) out[i] = true;
    }
    return out as boolean[];
  }, [sessions]);

  const ready = d ? d.readinessAvailable !== "unavailable" : false;
  const weekly = d?.weeklyRing ?? { done: 0, target: 0 };
  const vol7 = d ? fromKg(d.weeklyVolumeKg, units) : 0;
  const adherence = cons.data ? Math.round(cons.data.adherence * 100) : null;
  const activeGoals = (goals.data ?? []).filter((g) => g.active);
  // today's session: the dashboard's scheduled one, else the first planned workout (what Train shows)
  const plannedToday = (planned.data ?? []).find((w) => !w.scheduledDate || new Date(w.scheduledDate).toDateString() === new Date().toDateString());
  const todayW = d?.todayWorkout
    ? { name: d.todayWorkout.name, meta: `${d.todayWorkout.durationMin ?? 45} min · ${d.todayWorkout.exercises} exercises`, muscles: d.todayWorkout.muscles }
    : plannedToday
      ? { name: plannedToday.name, meta: `${plannedToday.estimatedDurationMin ?? 45} min · ${plannedToday.exercises.length} exercises`, muscles: plannedToday.targetMuscleKeys }
      : null;

  // ── metric detail sheets, built from real data ───────────────────────────
  const details = useMemo<Record<string, Detail>>(() => {
    const out: Record<string, Detail> = {};
    const r = readiness.data;
    const recent = [...(checkins.data ?? [])].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)).slice(-14);
    out.readiness = {
      id: "readiness",
      eyebrow: "recovery",
      title: "Readiness",
      value: ready && r ? String(r.score) : "—",
      unit: "/ 100",
      chart: recent.map((c) => c.sleepH ?? 0).filter(Boolean),
      mode: "curve",
      color: colors.pink,
      factors: r?.factors ?? [],
      recommendation: r?.recommendation ?? "Log a daily check-in and Forma scores your readiness before each session.",
      to: "/progress",
    };
    const weeks = cons.data?.weeks ?? [];
    const vols = weeks.slice(-8).map((w) => Math.round(fromKg(w.volumeKg, units)));
    const avg = vols.length > 1 ? vols.slice(0, -1).reduce((a, b) => a + b, 0) / (vols.length - 1) : 0;
    const byEx = new Map<string, number>();
    for (const s of sessions.filter((x) => Date.parse(x.startedAt) >= Date.now() - 7 * DAY_MS))
      for (const p of s.performances) byEx.set(p.exercise.name, (byEx.get(p.exercise.name) ?? 0) + p.sets.filter((x) => x.completedAt && !x.isWarmup).reduce((n, x) => n + (x.weightKg ?? 0) * (x.reps ?? 0), 0));
    const top = [...byEx.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const topMax = top[0]?.[1] || 1;
    out.volume = {
      id: "volume",
      eyebrow: "training load",
      title: "7-day volume",
      value: `${(vol7 / 1000).toFixed(1)}k`,
      unit: u,
      chart: vols,
      mode: "bars",
      color: colors.cyan,
      factors: top.map(([name, kg]) => ({ label: name, value: `${Math.round(fromKg(kg, units)).toLocaleString()} ${u}`, fraction: kg / topMax })),
      recommendation: !vols.length ? "Finish a few workouts and your weekly volume trend appears here." : vol7 < avg * 0.7 ? "Volume is well below your recent average — a lighter week is fine, but plan your next session to stay on track." : vol7 > avg * 1.3 && avg > 0 ? "Volume is well above your average. Watch recovery and consider a lighter session next." : "Volume is in line with your recent weeks. Keep the progression steady.",
      to: "/progress",
    };
    out.consistency = {
      id: "consistency",
      eyebrow: "habits",
      title: "Consistency",
      value: adherence != null ? `${adherence}%` : "—",
      unit: "adherence · 13 wks",
      chart: weeks.map((w) => w.sessions),
      mode: "bars",
      color: colors.lime,
      factors: cons.data
        ? [
            { label: "Adherence", value: `${adherence}%`, fraction: cons.data.adherence },
            { label: "Current streak", value: `${cons.data.currentStreak} days`, fraction: Math.min(1, cons.data.currentStreak / 14) },
            { label: "Weekly target", value: `${cons.data.target} sessions`, fraction: Math.min(1, (weeks.at(-1)?.sessions ?? 0) / Math.max(1, cons.data.target)) },
          ]
        : [],
      recommendation: adherence == null ? "Train a couple of weeks and your consistency shows up here." : adherence >= 80 ? "Excellent consistency. This is what drives progress — keep it up." : adherence >= 50 ? "Solid base. Locking in fixed training days usually lifts adherence fastest." : "Shorter sessions on more days beat skipped long ones. Try a 20-minute quick workout.",
      to: "/progress",
    };
    return out;
  }, [readiness.data, checkins.data, ready, cons.data, sessions, units, u, vol7, adherence]);

  const hasRecovery = ready && !!d;
  const score = readiness.data?.score ?? (hasRecovery ? d!.readiness : null);

  const generate = async () => {
    setGenerating(true);
    try {
      const w = (await api.workouts.generate({ focus: ["chest", "back", "quads"], durationMin: user?.sessionLengthTargetMin ?? 45, save: true })) as { id?: string };
      if (!w?.id) throw new Error("Couldn't generate a workout. Try choosing one instead.");
      invalidateResource();
      await Promise.all([dash.refetch(), planned.refetch()]);
      toast.success("Today's workout is ready");
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setGenerating(false);
    }
  };

  // one short, contextual line under the greeting
  const subtitle = active.data
    ? "A workout is in progress"
    : todayW
      ? `${todayW.name} today`
      : (d?.streakDays ?? 0) > 0
        ? `${d!.streakDays}-day streak — keep it going`
        : "Ready when you are";

  // the single Kai insight: a server insight if there is one, else the most relevant nudge
  const serverInsight = prog.has("insights") ? (d?.insights ?? []).find((i) => i.id !== dismissed) : undefined;
  const nudge = d && !hasRecovery ? "No recovery data yet. A quick check-in lets me score your readiness before each session." : d && d.streakDays === 0 && sessions.length > 0 ? "Your streak has lapsed. A session today restarts it." : null;
  const kai = serverInsight ? { label: serverInsight.category, title: serverInsight.title, text: serverInsight.body, id: serverInsight.id } : { label: "Kai", title: undefined, text: nudge ?? d?.trainerMessage ?? "Ask me anything about your training.", id: null };

  return (
    <View style={{ flex: 1 }}>
      <Screen tabs refreshing={dash.loading && !dash.initialLoading} onRefresh={refresh}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text variant="title" numberOfLines={1}>{d?.greeting ?? partOfDay()}{(d?.user?.name ?? user?.name) ? `, ${(d?.user?.name ?? user?.name ?? "").split(" ")[0]}` : ""}</Text>
            {dash.initialLoading ? <Skel h={14} w="60%" style={{ marginTop: 8 }} /> : <Text color="secondary" numberOfLines={1} style={{ marginTop: 4 }}>{subtitle}</Text>}
          </View>
          <ProfileMenu />
        </View>

        {dash.error && !d ? <View style={{ marginBottom: 20 }}><ErrorState message={errorMessage(dash.error)} onRetry={dash.refetch} /></View> : null}

        <View style={{ marginBottom: 20 }}>
          <Quiet widgetKey="readiness">
            <ReadinessCard
              loading={dash.initialLoading}
              score={hasRecovery ? score : null}
              recommendation={readiness.data?.recommendation}
              volume={d ? `${(vol7 / 1000).toFixed(1)}k` : "—"}
              unit={u}
              consistency={adherence != null ? `${adherence}%` : "—"}
              checkedIn={today.done}
              canCheckIn={prefs.recovery.manualCheckins}
              onCheckIn={() => setCheckin(true)}
              onOpen={(id) => setDetail(details[id])}
            />
          </Quiet>
        </View>

        <View style={{ marginBottom: 20 }}>
          <TodayCard
            loading={dash.initialLoading}
            activeName={active.data?.name}
            name={todayW?.name}
            meta={todayW?.meta}
            muscles={todayW?.muscles ?? []}
            upcoming={d?.upcomingWorkout?.name}
            generating={generating}
            onPrimary={() => router.push(active.data ? "/workout/active" : "/workouts")}
            onGenerate={generate}
            onChoose={() => router.push("/workouts")}
          />
        </View>

        <View style={{ marginBottom: 20 }}>
          <Quiet widgetKey="workout-streak">
            <WeekCard done={weekly.done} target={weekly.target} streak={d?.streakDays ?? 0} trained={trained} onOpen={() => router.push(prog.has("progress_basic") ? "/progress" : "/workouts")} />
          </Quiet>
        </View>

        <PressScale onPress={() => router.push("/trainer")} to={0.985} accessibilityLabel={`Open chat with ${d?.trainerName ?? "Kai"}`} style={{ marginBottom: 24 }}>
          <RecessedSurface radiusSize="large" style={{ padding: 16, flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <KaiOrb size={32} look={look} state={coachMood(d)} />
            <View style={{ flex: 1, gap: 3 }}>
              <Label>{(d?.trainerName ?? "Kai").toUpperCase()}{kai.label !== "Kai" ? ` · ${kai.label.toUpperCase()}` : ""}</Label>
              {kai.title ? <Text variant="cardTitle">{kai.title}</Text> : null}
              <Text color="secondary" numberOfLines={3}>{kai.text}</Text>
            </View>
            {kai.id ? (
              <PressScale hitSlop={12} accessibilityLabel="Dismiss insight" onPress={async () => { const id = kai.id!; setDismissed(id); await api.trainer.dismissInsight(id).catch(() => {}); dash.refetch(); }}>
                <Ionicons name="close" size={18} color={colors.textTertiary} />
              </PressScale>
            ) : <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} style={{ alignSelf: "center" }} />}
          </RecessedSurface>
        </PressScale>

        {prog.has("goals") ? (
          <View style={{ marginBottom: 12 }}>
            <SectionHeading title="Goals" action="All goals" onAction={() => router.push("/goals")} />
            <Quiet widgetKey="goals-card">
              <Card variant="compact" style={{ marginBottom: 0 }}>
                {goals.initialLoading ? [0, 1].map((i) => <Skel key={i} h={48} r={16} style={{ marginBottom: 8 }} />) : goals.error && !goals.data ? (
                  <ErrorState message={errorMessage(goals.error)} onRetry={goals.refetch} />
                ) : activeGoals.length === 0 ? (
                  <EmptyState title="No goals yet" body="Set a target for steps, protein, sleep or training." action="Create a goal" onAction={() => router.push("/goals")} />
                ) : (
                  <View style={{ gap: 4 }}>{activeGoals.slice(0, 2).map((g) => <GoalRow key={g.id} g={g} onPress={() => setLogGoal(g)} />)}</View>
                )}
              </Card>
            </Quiet>
          </View>
        ) : null}

        {d?.recentPRs?.length ? (
          <View style={{ marginBottom: 12 }}>
            <SectionHeading title="Recent records" action="All records" onAction={() => router.push("/records")} />
            <Card variant="compact" style={{ marginBottom: 0 }}>
              <View style={{ gap: 12 }}>
                {d.recentPRs.slice(0, 3).map((p, i) => (
                  <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <View style={{ flex: 1 }}><Text numberOfLines={1}>{p.lift}</Text><Text variant="meta" color="tertiary">{p.recordType.replace(/_/g, " ")}</Text></View>
                    <Num size={18} style={{ color: colors.lime }}>{p.recordType === "max_reps" ? `${p.value} reps` : `${Math.round(fromKg(p.value, units))} ${u}`}</Num>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        ) : null}
      </Screen>

      <Sheet visible={!!detail} onClose={() => setDetail(null)} eyebrow={detail?.eyebrow} title={detail?.title}>
        {detail ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <Num size={44}>{detail.value}</Num>
              <Text color="tertiary" style={{ marginBottom: 6 }}>{detail.unit}</Text>
            </View>
            <View style={{ padding: 12, borderRadius: radius.medium, backgroundColor: colors.surface }}>
              {detail.chart.length >= 2 ? (detail.mode === "bars" ? <MiniBars data={detail.chart} tone={detail.id === "volume" ? "cyan" : "lime"} height={72} /> : <ScrubChart data={detail.chart} unit="h sleep" color={detail.color} height={90} />) : <Text color="tertiary" style={{ textAlign: "center", paddingVertical: 20 }}>Not enough history to chart yet.</Text>}
            </View>
            {detail.factors.length ? (
              <View style={{ gap: 12 }}>
                <Label>WHAT'S DRIVING IT</Label>
                {detail.factors.map((f) => (
                  <View key={f.label} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text numberOfLines={1} style={{ flex: 1 }}>{f.label}</Text><Num size={13} color="secondary">{f.value}</Num></View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)" }}><View style={{ width: `${Math.round(Math.min(1, f.fraction) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: detail.color }} /></View>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ padding: 14, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.lineSoft, gap: 6 }}>
              <Label style={{ color: colors.cyan }}>RECOMMENDATION</Label>
              <Text color="secondary">{detail.recommendation}</Text>
            </View>
            {prog.has("progress_basic") ? <Button label="View full history" variant="ghost" onPress={() => { setDetail(null); router.push(detail.to as never); }} /> : null}
          </>
        ) : null}
      </Sheet>

      <CheckinSheet visible={checkin} onClose={() => setCheckin(false)} seed={today.latest} onSaved={() => { today.refetch(); dash.refetch(); readiness.refetch(); }} />
      <GoalLogSheet goal={logGoal} onClose={() => setLogGoal(null)} onLogged={() => goals.refetch()} />
    </View>
  );
}


function ReadinessCard({ loading, score, recommendation, volume, unit, consistency, checkedIn, canCheckIn, onCheckIn, onOpen }: { loading: boolean; score: number | null; recommendation?: string; volume: string; unit: string; consistency: string; checkedIn: boolean; canCheckIn: boolean; onCheckIn: () => void; onOpen: (id: "readiness" | "volume" | "consistency") => void }) {
  if (loading) return <Skel h={150} r={24} />;
  const has = score != null;
  const status = !has ? "No recovery data yet" : score >= 80 ? "Primed to train" : score >= 65 ? "Good to go" : score >= 50 ? "Take it steady" : "Prioritise recovery";
  const line = !has ? "Check in and I'll score your readiness before each session." : (recommendation ?? "").split(/(?<=[.!?])\s/)[0] || "Your recovery looks steady today.";
  return (
    <Card variant="compact" style={{ marginBottom: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <PressScale onPress={() => onOpen("readiness")} to={0.96} accessibilityLabel={`Readiness ${has ? score : "not scored"}. Details`}>
          <View style={{ width: 88, height: 88, alignItems: "center", justifyContent: "center" }}>
            <Ring pct={has ? score : 0} tone="pink" size={88} stroke={8} />
            <View style={{ position: "absolute", alignItems: "center" }}>
              <CountUp value={has ? String(score) : "—"} size={26} />
            </View>
          </View>
        </PressScale>
        <View style={{ flex: 1, gap: 3 }}>
          <Label>READINESS</Label>
          <Text variant="cardTitle">{status}</Text>
          <Text color="secondary" numberOfLines={2}>{line}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16, gap: 8 }}>
        <PressScale onPress={() => onOpen("volume")} to={0.97} style={{ flex: 1, paddingVertical: 4 }} accessibilityLabel={`7-day volume ${volume} ${unit}. Details`}>
          <Label>7-DAY VOLUME</Label>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 2 }}><CountUp value={volume} size={20} /><Text variant="meta" color="tertiary">{unit}</Text></View>
        </PressScale>
        <PressScale onPress={() => onOpen("consistency")} to={0.97} style={{ flex: 1, paddingVertical: 4 }} accessibilityLabel={`Consistency ${consistency}. Details`}>
          <Label>CONSISTENCY</Label>
          <View style={{ marginTop: 2 }}><CountUp value={consistency} size={20} /></View>
        </PressScale>
        {canCheckIn ? <Button label={checkedIn ? "Update" : "Check in"} variant="text" onPress={onCheckIn} style={{ minWidth: 88 }} /> : null}
      </View>
    </Card>
  );
}

function TodayCard({ loading, activeName, name, meta, muscles, upcoming, generating, onPrimary, onGenerate, onChoose }: { loading: boolean; activeName?: string; name?: string; meta?: string; muscles: string[]; upcoming?: string; generating: boolean; onPrimary: () => void; onGenerate: () => void; onChoose: () => void }) {
  if (loading) return <Skel h={190} r={32} />;
  const has = !!activeName || !!name;
  return (
    <Card variant="hero" style={{ marginBottom: 0 }}>
      <Label>{activeName ? "WORKOUT IN PROGRESS" : "TODAY"}</Label>
      {has ? (
        <View style={{ gap: 6, marginTop: 6 }}>
          <Text variant="heading">{activeName ?? name}</Text>
          {!activeName && meta ? <Text color="secondary">{meta}</Text> : null}
          {!activeName && muscles.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              {muscles.slice(0, 4).map((m) => <View key={m} style={{ paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: "rgba(213,26,122,0.16)", justifyContent: "center" }}><Text variant="meta" style={{ color: colors.pinkSoft }}>{m.toLowerCase()}</Text></View>)}
            </View>
          ) : null}
          <View style={{ marginTop: 14 }}><Button label={activeName ? "Resume workout" : "Start workout"} onPress={onPrimary} /></View>
        </View>
      ) : (
        <View style={{ gap: 6, marginTop: 6 }}>
          <Text variant="heading">Nothing planned today</Text>
          <Text color="secondary">{upcoming ? `Up next: ${upcoming}. Or build a session for today.` : "Generate a session around your recovery and goals, or pick one yourself."}</Text>
          <View style={{ marginTop: 14, gap: 2 }}>
            <Button label="Generate workout" loading={generating} onPress={onGenerate} />
            <Button label="Choose a workout" variant="text" onPress={onChoose} />
          </View>
        </View>
      )}
    </Card>
  );
}

function WeekCard({ done, target, streak, trained, onOpen }: { done: number; target: number; streak: number; trained: boolean[]; onOpen: () => void }) {
  const left = target ? Math.max(0, target - done) : 0;
  return (
    <Card variant="compact" style={{ marginBottom: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Label>THIS WEEK</Label>
        <PressScale onPress={onOpen} hitSlop={10} accessibilityLabel="Open progress"><Text variant="meta" color="pink">Progress</Text></PressScale>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Num size={34}>{done}</Num>
          <Text color="tertiary">{target ? `of ${target} sessions${left ? ` · ${left} to go` : " · goal met"}` : "sessions"}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Flame active={streak > 0} />
          <Text variant="meta" color="secondary">{streak > 0 ? `${streak}-day streak` : "No streak"}</Text>
        </View>
      </View>
      <View style={{ marginTop: 12 }}><ProgressBar pct={target ? (done / target) * 100 : 0} tone="pink" /></View>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
        {DAYS.map((l, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", gap: 5 }}>
            <View style={{ height: 22, alignSelf: "stretch", borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.07)" }}>
              {trained[i] ? <Fill angle={135} stops={[colors.pink, colors.coral]} /> : null}
            </View>
            <Text variant="meta" color="tertiary" style={{ fontSize: 11 }}>{l}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function Flame({ active }: { active: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 800, useNativeDriver: true }), Animated.timing(a, { toValue: 0, duration: 800, useNativeDriver: true }), Animated.delay(2000)]));
    loop.start();
    return () => loop.stop();
  }, [active, a]);
  return (
    <Animated.View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,182,97,0.2)", transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }, { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-8deg"] }) }] }}>
      <Ionicons name="flame" size={17} color={active ? colors.amber : colors.textTertiary} />
    </Animated.View>
  );
}

function GoalRow({ g, onPress }: { g: GoalWithProgress; onPress: () => void }) {
  const pct = g.target ? (g.current / g.target) * 100 : 0;
  const done = g.completed || g.current >= g.target;
  const tone = (["pink", "cyan", "lime", "amber", "mauve", "violet"].includes(g.tone) ? g.tone : "pink") as Tone;
  return (
    <PressScale onPress={onPress} to={0.985} accessibilityLabel={`${g.label}, ${g.current} of ${g.target} ${g.unit}. Log progress`} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 52 }}>
      <RingValue pct={pct} size={40} tone={tone} color={done ? colors.lime : undefined}>
        {done ? <Ionicons name="checkmark" size={16} color={colors.lime} /> : null}
      </RingValue>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{g.label}</Text>
        <Text variant="meta" color="tertiary">{g.current.toLocaleString()} / {g.target.toLocaleString()} {g.unit} · {g.cadence}</Text>
      </View>
      <Ionicons name="add-circle-outline" size={22} color={colors.textSecondary} />
    </PressScale>
  );
}
