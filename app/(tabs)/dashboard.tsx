import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/api/client";
import { invalidateResource, useAchievements, useDashboard, useGoals, useNotifications, useSessionHistory, useWallet } from "@/api/hooks";
import { useProgression } from "@/api/settings";
import { useAuth } from "@/auth/auth-provider";
import { fromKg, unitLabel } from "@/lib/workouts";
import { useEquippedItem, useTheme } from "@/theme/theme-provider";
import { colors } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, ProgressBar, RingStat, SectionHeading } from "@/components/ui/controls";
import { AreaChart, Card, ErrorState } from "@/components/ui/extra";
import { KaiOrb } from "@/components/ui/kai-orb";
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

export default function Dashboard() {
  useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const prog = useProgression();
  const units = user?.unitPreference ?? "imperial";
  const u = unitLabel(units);
  const dash = useDashboard();
  const hist = useSessionHistory();
  const goals = useGoals();
  const wallet = useWallet();
  const notes = useNotifications();
  const ach = useAchievements();
  const look = useEquippedItem("avatar")?.id;
  const d = dash.data;

  const refresh = () => { invalidateResource(); dash.refetch(); hist.refetch(); goals.refetch(); wallet.refetch(); notes.refetch(); ach.refetch(); };

  const { volThis, volLast, trained } = useMemo(() => {
    const week = (n: number) => {
      const start = weekStart(n).getTime();
      const out = new Array(7).fill(0);
      for (const s of hist.data ?? []) {
        const day = new Date(s.startedAt).setHours(0, 0, 0, 0);
        const i = Math.floor((day - start) / DAY_MS);
        if (i >= 0 && i < 7) out[i] += fromKg(s.totalVolumeKg, units);
      }
      return out;
    };
    const t = week(0);
    return { volThis: t, volLast: week(1), trained: t.map((v) => v > 0) };
  }, [hist.data, units]);

  const ready = d?.readinessAvailable !== "unavailable";
  const weekly = d?.weeklyRing ?? { done: 0, target: 0 };
  const weeklyPct = weekly.target ? Math.round((weekly.done / weekly.target) * 100) : 0;
  const vol7 = d ? fromKg(d.weeklyVolumeKg, units) : 0;
  const unread = notes.data?.unreadCount ?? d?.notificationsUnread ?? 0;
  const noRecovery = d && !ready;
  const streakLapsed = d && d.streakDays === 0 && (hist.data?.length ?? 0) > 0;

  return (
    <Screen tabs refreshing={dash.loading && !dash.initialLoading} onRefresh={refresh}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text variant="title">{d?.greeting ?? partOfDay()}{(d?.user?.name ?? user?.name) ? `, ${(d?.user?.name ?? user?.name ?? "").split(" ")[0]}` : ""}</Text>
          <Text color="secondary" numberOfLines={3} style={{ marginTop: 4 }}>{d?.trainerMessage ?? (dash.initialLoading ? "Loading your day…" : "Here's where you stand today.")}</Text>
        </View>
        <View style={{ alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.push("/notifications")} hitSlop={10}>
            <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
            {unread > 0 ? <View style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.pink, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}><Text style={{ color: "#fff", fontSize: 10 }}>{unread}</Text></View> : null}
          </Pressable>
          {prog.has("store") ? (
            <Pressable onPress={() => router.push("/store")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="logo-bitcoin" size={14} color={colors.amber} />
              <Num size={13}>{(wallet.data?.balance ?? 0).toLocaleString()}</Num>
            </Pressable>
          ) : null}
        </View>
      </View>

      {dash.error && !d ? <ErrorState message="Couldn't load your dashboard." onRetry={dash.refetch} /> : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <RingStat label="readiness" value={ready && d ? String(d.readiness) : "—"} sub={ready ? "from your check-in" : "log a check-in"} pct={ready ? d?.readiness ?? 0 : 0} tone="pink" onPress={() => router.push("/progress")} />
        <RingStat label="7-day volume" value={d ? `${(vol7 / 1000).toFixed(1)}k` : "—"} sub={u} pct={Math.min(100, Math.round(vol7 / 300))} tone="cyan" onPress={() => router.push("/progress")} />
        <RingStat label="streak" value={d ? String(d.streakDays) : "—"} sub="days" pct={Math.min(100, (d?.streakDays ?? 0) * 10)} tone="lime" onPress={() => router.push("/progress")} />
      </View>

      <SectionHeading title="Today" />
      <RaisedSurface radiusSize="large" style={{ padding: 18, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <KaiOrb size={28} look={look} />
          <Label>{d?.trainerName?.toUpperCase() ?? "KAI"} SUGGESTS</Label>
        </View>
        {d?.todayWorkout ? (
          <>
            <Text variant="heading">{d.todayWorkout.name}</Text>
            <Text color="secondary">{d.todayWorkout.exercises} exercises{d.todayWorkout.durationMin ? ` · ${d.todayWorkout.durationMin} min` : ""}</Text>
            <Text variant="meta" color="tertiary">{d.todayWorkout.muscles.join(" · ")}</Text>
          </>
        ) : (
          <>
            <Text variant="heading">Nothing scheduled</Text>
            <Text color="secondary">{d?.upcomingWorkout ? `Up next: ${d.upcomingWorkout.name}` : "Build a workout or let your trainer plan one."}</Text>
          </>
        )}
        <Button label={d?.activeSessionId ? "Resume workout" : d?.todayWorkout ? "Start workout" : "Open training"} variant="accent" onPress={() => router.push(d?.activeSessionId ? "/workout/active" : "/workouts")} />
      </RaisedSurface>

      {noRecovery ? (
        <Card style={{ marginTop: 14, marginBottom: 0 }}>
          <Text>No recovery data yet. Log a quick check-in and Forma can score your readiness before each session.</Text>
          <View style={{ marginTop: 10 }}><Button label="Check in" variant="ghost" onPress={() => router.push("/progress")} /></View>
        </Card>
      ) : null}
      {streakLapsed ? <Card style={{ marginTop: 14, marginBottom: 0 }}><Text>Your streak has lapsed. A session today restarts it.</Text></Card> : null}

      <SectionHeading title="This week" />
      <SoftSurface style={{ padding: 18, gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}><Num size={30}>{weekly.done}</Num><Text color="tertiary">of {weekly.target} sessions</Text></View>
            <ProgressBar pct={weeklyPct} tone="pink" />
          </View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {DAYS.map((l, i) => (
            <View key={i} style={{ alignItems: "center", gap: 6 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: trained[i] ? colors.pink : "rgba(255,255,255,0.08)" }}>
                {trained[i] ? <Ionicons name="checkmark" size={16} color={colors.onColor} /> : null}
              </View>
              <Text variant="meta" color="tertiary">{l}</Text>
            </View>
          ))}
        </View>
      </SoftSurface>

      <SectionHeading title="Volume" />
      <SoftSurface style={{ padding: 18, gap: 10 }}>
        <AreaChart series={[{ color: colors.pink, data: volThis }, { color: colors.blue, data: volLast }]} height={120} />
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pink }} /><Text variant="meta" color="tertiary">This week</Text></View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue }} /><Text variant="meta" color="tertiary">Last week</Text></View>
        </View>
      </SoftSurface>

      {prog.has("goals") && (goals.data?.length ?? 0) > 0 ? (
        <>
          <SectionHeading title="Goals" action="See all" onAction={() => router.push("/goals")} />
          <SoftSurface style={{ padding: 18, gap: 14 }}>
            {goals.data!.slice(0, 4).map((g) => (
              <View key={g.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text>{g.label}</Text><Text variant="meta" color="tertiary">{g.current} / {g.target} {g.unit}</Text></View>
                <ProgressBar pct={g.target ? (g.current / g.target) * 100 : 0} tone="mauve" height={6} />
              </View>
            ))}
          </SoftSurface>
        </>
      ) : null}

      {d?.recentPRs?.length ? (
        <>
          <SectionHeading title="Recent records" action="All records" onAction={() => router.push("/records")} />
          <SoftSurface style={{ padding: 18, gap: 12 }}>
            {d.recentPRs.slice(0, 4).map((p, i) => (
              <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View><Text>{p.lift}</Text><Text variant="meta" color="tertiary">{p.recordType.replace(/_/g, " ")}</Text></View>
                <Num size={20} style={{ color: colors.lime }}>{p.recordType === "max_reps" ? p.value : Math.round(fromKg(p.value, units))}</Num>
              </View>
            ))}
          </SoftSurface>
        </>
      ) : null}

      {prog.has("achievements") && (ach.data ?? []).some((a) => a.unlockedAt) ? (
        <>
          <SectionHeading title="Achievements" />
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
          {d.insights.slice(0, 3).map((ins) => (
            <SoftSurface key={ins.id} style={{ padding: 16, gap: 6, marginBottom: 10 }}>
              <Label>{ins.category.toUpperCase()}</Label>
              <Text variant="heading" style={{ fontSize: 17 }}>{ins.title}</Text>
              <Text color="secondary">{ins.body}</Text>
              <Pressable onPress={async () => { await api.trainer.dismissInsight(ins.id).catch(() => {}); dash.refetch(); }}><Text variant="meta" color="pink">Dismiss</Text></Pressable>
            </SoftSurface>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
