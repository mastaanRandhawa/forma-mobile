/**
 * Home — the website's dashboard (pages/Home.tsx) as a single scrolling column:
 * greeting, metric rings (tap for a detail sheet), daily check-in, today's
 * session, streak, volume, weekly goal, up next, Kai, goals, records, insights.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useAchievements, useConsistency, useDashboard, useGoals, useNotifications, usePlannedWorkouts, useReadiness, useSessionHistory, useWallet } from "@/api/hooks";
import { usePrefs, useProgression } from "@/api/settings";
import type { GoalWithProgress } from "@/api/types";
import { useAuth } from "@/auth/auth-provider";
import { fromKg, unitLabel } from "@/lib/workouts";
import { useEquippedItem, useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius, toneColor, type Tone } from "@/theme/tokens";
import { CheckinCard, useCheckins } from "@/components/checkin";
import { GoalLogSheet } from "@/components/goal-log";
import { Quiet } from "@/components/quiet";
import { useActiveSession } from "@/components/workout-bar";
import { Screen } from "@/components/ui/screen";
import { Button, ProgressBar, RingStat, SectionHeading } from "@/components/ui/controls";
import { AreaChart, ErrorState, MiniBars, RingValue, ScrubChart, Sheet, Skel } from "@/components/ui/extra";
import { KaiOrb, coachMood } from "@/components/ui/kai-orb";
import { ProfileMenu } from "@/components/profile-menu";
import { RaisedSurface, SoftSurface } from "@/components/ui/surface";
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
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const prog = useProgression();
  const prefs = usePrefs();
  const units = user?.unitPreference ?? "imperial";
  const u = unitLabel(units);
  const dash = useDashboard();
  const hist = useSessionHistory();
  const goals = useGoals();
  const wallet = useWallet();
  const notes = useNotifications();
  const ach = useAchievements();
  const readiness = useReadiness();
  const cons = useConsistency(13);
  const planned = usePlannedWorkouts();
  const checkins = useCheckins();
  const active = useActiveSession();
  const look = useEquippedItem("avatar")?.id;
  const d = dash.data;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [logGoal, setLogGoal] = useState<GoalWithProgress | null>(null);

  const refresh = () => {
    invalidateResource();
    [dash, hist, goals, wallet, notes, ach, readiness, cons, planned, checkins, active].forEach((r) => r.refetch());
  };

  const sessions = useMemo(() => hist.data ?? [], [hist.data]);
  const { volThis, volLast, trained } = useMemo(() => {
    const week = (n: number) => {
      const start = weekStart(n).getTime();
      const out = new Array(7).fill(0);
      for (const s of sessions) {
        const i = Math.floor((new Date(s.startedAt).setHours(0, 0, 0, 0) - start) / DAY_MS);
        if (i >= 0 && i < 7) out[i] += Math.round(fromKg(s.totalVolumeKg, units));
      }
      return out;
    };
    const t = week(0);
    return { volThis: t, volLast: week(1), trained: t.map((v) => v > 0) };
  }, [sessions, units]);

  const ready = d ? d.readinessAvailable !== "unavailable" : false;
  const weekly = d?.weeklyRing ?? { done: 0, target: 0 };
  const vol7 = d ? fromKg(d.weeklyVolumeKg, units) : 0;
  const unread = notes.data?.unreadCount ?? d?.notificationsUnread ?? 0;
  const adherence = cons.data ? Math.round(cons.data.adherence * 100) : null;
  const avgSession = sessions.length ? Math.round(sessions.slice(0, 8).reduce((n, s) => n + fromKg(s.totalVolumeKg, units), 0) / Math.min(8, sessions.length)) : 0;
  const upNext = (planned.data ?? []).filter((w) => w.scheduledDate && Date.parse(w.scheduledDate) >= new Date().setHours(0, 0, 0, 0)).sort((a, b) => Date.parse(a.scheduledDate!) - Date.parse(b.scheduledDate!)).slice(0, 3);
  const activeGoals = (goals.data ?? []).filter((g) => g.active);

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
  const insight = d && !hasRecovery ? { tone: "cyan" as Tone, icon: "moon-outline" as const, text: "No recovery data yet. Log a quick check-in and Forma can score your readiness before each session." } : d && d.streakDays === 0 && sessions.length > 0 ? { tone: "amber" as Tone, icon: "pulse-outline" as const, text: "Your streak has lapsed. A session today restarts it." } : null;

  return (
    <View style={{ flex: 1 }}>
      <Screen tabs refreshing={dash.loading && !dash.initialLoading} onRefresh={refresh}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text variant="title">{d?.greeting ?? partOfDay()}{(d?.user?.name ?? user?.name) ? `, ${(d?.user?.name ?? user?.name ?? "").split(" ")[0]}` : ""}</Text>
            {dash.initialLoading ? <Skel h={14} w="80%" style={{ marginTop: 8 }} /> : <Text color="secondary" numberOfLines={2} style={{ marginTop: 4 }}>{d?.trainerMessage ?? "Here's where you stand today."}</Text>}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 4 }}>
            <Pressable onPress={() => router.push("/notifications")} hitSlop={10} accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
              {unread > 0 ? <View style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.pink, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}><Text style={{ color: "#fff", fontSize: 10 }}>{unread > 99 ? "99+" : unread}</Text></View> : null}
            </Pressable>
            <ProfileMenu />
          </View>
        </View>

        {dash.error && !d ? <ErrorState message={errorMessage(dash.error)} onRetry={dash.refetch} /> : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          {[
            { id: "readiness", label: "readiness", value: hasRecovery ? String(d!.readiness) : "—", sub: hasRecovery ? "from check-in" : "log a check-in", pct: hasRecovery ? d!.readiness : 0, tone: "pink" as Tone },
            { id: "volume", label: "7-day volume", value: d ? `${(vol7 / 1000).toFixed(1)}k` : "—", sub: sessions.length ? u : "no sessions yet", pct: Math.min(100, Math.round(vol7 / 300)), tone: "cyan" as Tone },
            { id: "consistency", label: "consistency", value: adherence != null ? `${adherence}%` : "—", sub: "last 13 weeks", pct: adherence ?? 0, tone: "lime" as Tone },
          ].map((r) => (
            <Quiet key={r.id} widgetKey={r.id}>
              <RingStat label={r.label} value={r.value} sub={r.sub} pct={r.pct} tone={r.tone} onPress={() => setDetail(details[r.id])} />
            </Quiet>
          ))}
        </View>

        {prefs.recovery.manualCheckins ? <View style={{ marginTop: 14 }}><CheckinCard readiness={readiness.data?.score ?? (hasRecovery ? d!.readiness : null)} onSaved={() => { dash.refetch(); readiness.refetch(); }} /></View> : null}

        <SectionHeading title="Today" />
        <TodayCard
          loading={dash.initialLoading}
          name={d?.todayWorkout?.name}
          meta={d?.todayWorkout ? `${d.todayWorkout.durationMin ?? 45} min · ${d.todayWorkout.exercises} exercises` : undefined}
          muscles={d?.todayWorkout?.muscles ?? []}
          trainerName={d?.trainerName}
          look={look}
          activeName={active.data?.name}
          upcoming={d?.upcomingWorkout?.name}
          onPress={() => router.push(active.data ? "/workout/active" : "/workouts")}
        />

        {insight && prog.has("insights") ? (
          <View style={{ marginTop: 14, flexDirection: "row", gap: 12, padding: 14, borderRadius: radius.medium, backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: toneColor[insight.tone] }}>
            <Ionicons name={insight.icon} size={18} color={toneColor[insight.tone]} />
            <Text style={{ flex: 1 }}>{insight.text}</Text>
          </View>
        ) : null}

        <SectionHeading title="This week" action="Progress" onAction={() => prog.has("progress_basic") ? router.push("/progress") : router.push("/workouts")} />
        <Quiet widgetKey="workout-streak">
          <SoftSurface style={{ padding: 18, gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Num size={40}>{d?.streakDays ?? 0}</Num>
                <Text color="tertiary">{(d?.streakDays ?? 0) === 0 ? "start a streak today" : "day streak"}</Text>
              </View>
              <Flame active={(d?.streakDays ?? 0) > 0} />
            </View>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Label>WEEKLY GOAL</Label>
                <Num size={12} color="tertiary">{weekly.done} / {weekly.target}{weekly.target && weekly.done >= weekly.target ? " · met" : weekly.target ? ` · ${weekly.target - weekly.done} to go` : ""}</Num>
              </View>
              <ProgressBar pct={weekly.target ? (weekly.done / weekly.target) * 100 : 0} tone="pink" />
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {DAYS.map((l, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                  <View style={{ height: 24, alignSelf: "stretch", borderRadius: 7, backgroundColor: trained[i] ? colors.amber : "rgba(255,255,255,0.07)" }} />
                  <Text variant="meta" color="tertiary" style={{ fontSize: 10 }}>{l}</Text>
                </View>
              ))}
            </View>
          </SoftSurface>
        </Quiet>

        <SectionHeading title="Training volume" />
        <Quiet widgetKey="training-volume-chart">
          <SoftSurface style={{ padding: 18, gap: 10 }}>
            {sessions.length ? <AreaChart series={[{ color: colors.pink, data: volThis }, { color: colors.blue, data: volLast }]} height={120} /> : <Text color="tertiary" style={{ paddingVertical: 24, textAlign: "center" }}>Finish a workout and this week's volume charts here.</Text>}
            <View style={{ flexDirection: "row", gap: 16 }}>
              <Legend color={colors.pink} label="This week" />
              <Legend color={colors.blue} label="Last week" />
              <Text variant="meta" color="tertiary" style={{ marginLeft: "auto" }}>{u}</Text>
            </View>
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 12 }}>
              <View style={{ flex: 1, gap: 2 }}><Label>AVG SESSION</Label><Num size={18}>{avgSession ? `${(avgSession / 1000).toFixed(1)}k` : "—"}</Num></View>
              <View style={{ flex: 1, gap: 2 }}><Label>SESSIONS LOGGED</Label><Num size={18}>{sessions.length}{sessions.length >= 40 ? "+" : ""}</Num></View>
            </View>
          </SoftSurface>
        </Quiet>

        {upNext.length || prog.has("workouts") ? (
          <>
            <SectionHeading title="Up next" action="Training" onAction={() => router.push("/workouts")} />
            <SoftSurface style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
              {upNext.length === 0 ? (
                <Pressable onPress={() => router.push("/workouts")} style={{ alignItems: "center", paddingVertical: 18, gap: 6 }}>
                  <Ionicons name="calendar-outline" size={20} color={colors.textTertiary} />
                  <Text color="secondary">Nothing scheduled</Text>
                  <Label>PLAN YOUR NEXT SESSION</Label>
                </Pressable>
              ) : (
                upNext.map((w, i) => (
                  <Pressable key={w.id} onPress={() => router.push("/workouts")} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: i === upNext.length - 1 ? 0 : 1, borderBottomColor: colors.lineSoft }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><Ionicons name="barbell-outline" size={16} color={colors.textSecondary} /></View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1}>{w.name}</Text>
                      <Text variant="meta" color="tertiary" numberOfLines={1}>{w.targetMuscleKeys.join(", ") || `${w.exercises.length} exercises`}</Text>
                    </View>
                    <Text variant="meta" color="tertiary">{new Date(w.scheduledDate!).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</Text>
                  </Pressable>
                ))
              )}
            </SoftSurface>
          </>
        ) : null}

        <Pressable onPress={() => router.push("/trainer")} style={({ pressed }) => ({ marginTop: 14, opacity: pressed ? 0.85 : 1 })} accessibilityRole="button" accessibilityLabel={`Message ${d?.trainerName ?? "Kai"}`}>
          <SoftSurface style={{ padding: 16, flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <KaiOrb size={40} look={look} state={coachMood(d)} />
            <View style={{ flex: 1, gap: 4 }}>
              <Label>{(d?.trainerName ?? "Kai").toUpperCase()} · YOUR TRAINER</Label>
              <Text color="secondary" numberOfLines={3}>{d?.trainerMessage ?? "Ask me anything about your training."}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} style={{ alignSelf: "center" }} />
          </SoftSurface>
        </Pressable>

        {prog.has("goals") ? (
          <>
            <SectionHeading title="Goals" action="Manage" onAction={() => router.push("/goals")} />
            <Quiet widgetKey="goals-card">
              <SoftSurface style={{ padding: 16, gap: 10 }}>
                {goals.initialLoading ? [0, 1].map((i) => <Skel key={i} h={56} r={18} />) : goals.error && !goals.data ? (
                  <ErrorState message={errorMessage(goals.error)} onRetry={goals.refetch} />
                ) : activeGoals.length === 0 ? (
                  <View style={{ alignItems: "center", gap: 6, paddingVertical: 8 }}>
                    <Text color="secondary" style={{ textAlign: "center" }}>Set a target for steps, protein, sleep or training frequency.</Text>
                    <Button label="Create a goal" variant="ghost" onPress={() => router.push("/goals")} style={{ alignSelf: "stretch" }} />
                  </View>
                ) : (
                  <>
                    {activeGoals.slice(0, 3).map((g) => <GoalRow key={g.id} g={g} onPress={() => setLogGoal(g)} />)}
                    <Pressable onPress={() => router.push("/goals")} style={{ height: 40, borderRadius: radius.small, borderWidth: 1, borderStyle: "dashed", borderColor: colors.lineHighlight, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
                      <Ionicons name="add" size={14} color={colors.textTertiary} />
                      <Text variant="meta" color="tertiary">New goal</Text>
                    </Pressable>
                  </>
                )}
              </SoftSurface>
            </Quiet>
          </>
        ) : null}

        {d?.recentPRs?.length ? (
          <>
            <SectionHeading title="Recent records" action="All records" onAction={() => router.push("/records")} />
            <SoftSurface style={{ padding: 16, gap: 12 }}>
              {d.recentPRs.slice(0, 4).map((p, i) => (
                <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View style={{ flex: 1 }}><Text numberOfLines={1}>{p.lift}</Text><Text variant="meta" color="tertiary">{p.recordType.replace(/_/g, " ")}</Text></View>
                  <Num size={18} style={{ color: colors.lime }}>{p.recordType === "max_reps" ? `${p.value} reps` : `${Math.round(fromKg(p.value, units))} ${u}`}</Num>
                </View>
              ))}
            </SoftSurface>
          </>
        ) : null}

        {prog.has("achievements") && (ach.data ?? []).some((a) => a.unlockedAt) ? (
          <>
            <SectionHeading title="Achievements" action="See all" onAction={() => router.push("/records")} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {ach.data!.filter((a) => a.unlockedAt).slice(0, 6).map((a) => (
                <View key={a.key} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: colors.surface }}>
                  <Ionicons name="trophy" size={13} color={colors.amber} /><Text variant="meta">{a.title}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {prog.has("insights") && d?.insights?.length ? (
          <>
            <SectionHeading title="Insights" />
            {d.insights.slice(0, 3).map((ins) => <InsightCard key={ins.id} title={ins.title} body={ins.body} category={ins.category} onDismiss={async () => { await api.trainer.dismissInsight(ins.id).catch(() => {}); dash.refetch(); }} />)}
          </>
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

      <GoalLogSheet goal={logGoal} onClose={() => setLogGoal(null)} onLogged={() => goals.refetch()} />
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text variant="meta" color="tertiary">{label}</Text>
    </View>
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

function TodayCard({ loading, name, meta, muscles, trainerName, look, activeName, upcoming, onPress }: { loading: boolean; name?: string; meta?: string; muscles: string[]; trainerName?: string; look?: string; activeName?: string; upcoming?: string; onPress: () => void }) {
  if (loading) return <Skel h={180} r={32} />;
  return (
    <RaisedSurface radiusSize="large" style={{ padding: 18, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <KaiOrb size={26} look={look} />
        <Label>{activeName ? "WORKOUT IN PROGRESS" : `${(trainerName ?? "Kai").toUpperCase()} SUGGESTS`}</Label>
      </View>
      {activeName ? (
        <Text variant="heading">{activeName}</Text>
      ) : name ? (
        <>
          <Text variant="heading">{name}</Text>
          {meta ? <Text color="secondary">{meta}</Text> : null}
          {muscles.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{muscles.slice(0, 5).map((m) => <View key={m} style={{ paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: "rgba(213,26,122,0.16)", justifyContent: "center" }}><Text variant="meta" style={{ color: colors.pinkSoft }}>{m.toLowerCase()}</Text></View>)}</View> : null}
        </>
      ) : (
        <>
          <Text variant="heading">Nothing scheduled</Text>
          <Text color="secondary">{upcoming ? `Up next: ${upcoming}` : "No session planned for today. Plan one or start now."}</Text>
        </>
      )}
      <Button label={activeName ? "Resume workout" : name ? "Start workout" : "Go to training"} variant="accent" onPress={onPress} />
    </RaisedSurface>
  );
}

function GoalRow({ g, onPress }: { g: GoalWithProgress; onPress: () => void }) {
  const pct = g.target ? (g.current / g.target) * 100 : 0;
  const done = g.completed || g.current >= g.target;
  const tone = (["pink", "cyan", "lime", "amber", "mauve", "violet"].includes(g.tone) ? g.tone : "pink") as Tone;
  return (
    <Pressable onPress={onPress} accessibilityHint="Log progress" style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: radius.small, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}>
      <RingValue pct={pct} size={42} tone={tone} color={done ? colors.lime : undefined}>
        {done ? <Ionicons name="checkmark" size={16} color={colors.lime} /> : null}
      </RingValue>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{g.label}</Text>
        <Text variant="meta" color="tertiary">{g.current.toLocaleString()} / {g.target.toLocaleString()} {g.unit} · {g.cadence}</Text>
      </View>
      <Ionicons name="add-circle-outline" size={22} color={colors.textSecondary} />
    </Pressable>
  );
}

function InsightCard({ title, body, category, onDismiss }: { title: string; body: string; category: string; onDismiss: () => void }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <View style={{ flexDirection: "row", gap: 12, padding: 14, marginBottom: 10, borderRadius: radius.medium, backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.mauve }}>
      <Ionicons name="sparkles-outline" size={18} color={colors.mauve} />
      <View style={{ flex: 1, gap: 4 }}>
        <Label>{category.toUpperCase()}</Label>
        <Text style={{ fontFamily: fonts.medium }}>{title}</Text>
        <Text color="secondary">{body}</Text>
        <Pressable onPress={() => { setGone(true); onDismiss(); }} hitSlop={8} style={{ alignSelf: "flex-start", marginTop: 4 }}><Text variant="meta" color="pink">Dismiss</Text></Pressable>
      </View>
    </View>
  );
}
