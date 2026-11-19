/**
 * Records (website: pages/Records.tsx) — one card per lift with its best
 * estimated 1RM, heaviest set and most reps, a strength sparkline, gain since
 * the first log and (for the top lift) where you rank among Forma users.
 * Achievements follow. Tap a lift for its full history.
 */
import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/api/client";
import { errorMessage, useAchievements, useResource } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import type { PersonalRecord, StrengthSeries } from "@/api/types";
import { fromKg, unitLabel, type Units } from "@/lib/workouts";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { ExerciseDetailSheet } from "@/components/exercise";
import { Screen } from "@/components/ui/screen";
import { ProgressBar } from "@/components/ui/controls";
import { EmptyState, ErrorState, PageHeader, PillTabs, Skel, Sparkline } from "@/components/ui/extra";
import { SoftSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";

type Lift = { slug: string; name: string; e1rm: PersonalRecord | null; weight: PersonalRecord | null; reps: PersonalRecord | null; latest: string };

export default function Records() {
  useTheme();
  const { user } = useAuth();
  const units: Units = user?.unitPreference ?? "imperial";
  const prs = useResource<PersonalRecord[]>("prs", () => api.progress.personalRecords());
  const ach = useAchievements();
  const [view, setView] = useState<"lifts" | "achievements">("lifts");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const lifts = useMemo(() => {
    const map = new Map<string, Lift>();
    for (const p of prs.data ?? []) {
      if (!p.exercise) continue;
      const l = map.get(p.exercise.slug) ?? { slug: p.exercise.slug, name: p.exercise.name, e1rm: null, weight: null, reps: null, latest: p.achievedAt };
      const better = (cur: PersonalRecord | null) => !cur || p.value > cur.value;
      if (p.recordType === "max_1rm_estimate" && better(l.e1rm)) l.e1rm = p;
      if (p.recordType === "max_weight" && better(l.weight)) l.weight = p;
      if (p.recordType === "max_reps" && better(l.reps)) l.reps = p;
      if (Date.parse(p.achievedAt) > Date.parse(l.latest)) l.latest = p.achievedAt;
      map.set(p.exercise.slug, l);
    }
    return [...map.values()].sort((a, b) => (b.e1rm?.value ?? b.weight?.value ?? 0) - (a.e1rm?.value ?? a.weight?.value ?? 0));
  }, [prs.data]);
  const shown = lifts.filter((l) => !q.trim() || l.name.toLowerCase().includes(q.trim().toLowerCase()));
  const unlocked = (ach.data ?? []).filter((a) => a.unlockedAt).length;

  return (
    <Screen refreshing={prs.loading && !prs.initialLoading} onRefresh={() => { prs.refetch(); ach.refetch(); }}>
      <PageHeader title="Records" subtitle="Personal bests and achievements." />
      <PillTabs value={view} onChange={setView} options={[{ value: "lifts", label: `Lifts${lifts.length ? ` · ${lifts.length}` : ""}` }, { value: "achievements", label: `Achievements${ach.data ? ` · ${unlocked}/${ach.data.length}` : ""}` }]} />

      {view === "lifts" ? (
        <View style={{ marginTop: 14, gap: 10 }}>
          {prs.initialLoading ? [0, 1, 2].map((i) => <Skel key={i} h={110} r={32} />) : prs.error && !prs.data ? <ErrorState message={errorMessage(prs.error)} onRetry={prs.refetch} /> : lifts.length === 0 ? (
            <EmptyState title="No records yet" body="Finish your first workout and log some sets — your all-time bests appear here." />
          ) : (
            <>
              {lifts.length > 4 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 44, borderRadius: radius.small, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
                  <Ionicons name="search" size={16} color={colors.textTertiary} />
                  <TextInput value={q} onChangeText={setQ} placeholder="Find a lift" placeholderTextColor={colors.textTertiary} style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 15 }} />
                </View>
              ) : null}
              {shown.map((l, i) => <LiftCard key={l.slug} lift={l} units={units} top={i === 0 && !q} onPress={() => setOpen(l.slug)} />)}
              {!shown.length ? <Text color="tertiary" style={{ textAlign: "center" }}>No lifts match "{q}".</Text> : null}
            </>
          )}
        </View>
      ) : (
        <View style={{ marginTop: 14 }}>
          {ach.initialLoading ? <Skel h={80} r={24} /> : ach.error && !ach.data ? <ErrorState message={errorMessage(ach.error)} onRetry={ach.refetch} /> : (ach.data ?? []).length === 0 ? <EmptyState title="No achievements yet" body="Train consistently and milestones unlock here." /> : (
            [...(ach.data ?? [])].sort((a, b) => Number(!!b.unlockedAt) - Number(!!a.unlockedAt)).map((a) => {
              const done = !!a.unlockedAt;
              const pct = a.targetValue ? Math.min(100, (a.progress / a.targetValue) * 100) : done ? 100 : 0;
              return (
                <SoftSurface key={a.key} style={{ padding: 16, marginBottom: 10, opacity: done ? 1 : 0.85 }}>
                  <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: done ? "rgba(255,182,97,0.18)" : colors.surface }}>
                      <Ionicons name={done ? "trophy" : "trophy-outline"} size={20} color={done ? colors.amber : colors.textTertiary} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text>{a.title}</Text>
                      <Text variant="meta" color="tertiary">{a.detail}</Text>
                    </View>
                    {done ? <Text variant="meta" color="tertiary">{new Date(a.unlockedAt!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text> : null}
                  </View>
                  {!done && a.targetValue ? <View style={{ marginTop: 10, gap: 4 }}><ProgressBar pct={pct} tone="amber" height={5} /><Text variant="meta" color="tertiary">{a.progress} / {a.targetValue}</Text></View> : null}
                </SoftSurface>
              );
            })
          )}
        </View>
      )}
      <ExerciseDetailSheet slug={open} onClose={() => setOpen(null)} onOpenSlug={setOpen} />
    </Screen>
  );
}

function LiftCard({ lift, units, top, onPress }: { lift: Lift; units: Units; top: boolean; onPress: () => void }) {
  const u = unitLabel(units);
  const series = useResource<StrengthSeries | null>(`strength:${lift.slug}:365`, () => api.progress.strength(lift.slug, 365).catch(() => null));
  const cohort = useResource(`cohort:${lift.name}`, () => (top ? api.progress.cohort(lift.name).catch(() => null) : Promise.resolve(null)));
  const pts = (series.data?.series ?? []).map((p) => fromKg(p.e1rm, units));
  const gain = pts.length > 1 && pts[0] > 0 ? Math.round(((pts[pts.length - 1] - pts[0]) / pts[0]) * 100) : 0;
  const best = lift.e1rm ?? lift.weight;
  const c = cohort.data;
  return (
    <Pressable onPress={onPress} accessibilityHint="Opens this lift's history">
      <SoftSurface style={{ padding: 16, gap: 10, borderWidth: top ? 1 : 0, borderColor: top ? "rgba(216,255,99,0.3)" : "transparent" }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 16 }} numberOfLines={1}>{lift.name}</Text>
            <Text variant="meta" color="tertiary">{lift.weight ? `Heaviest ${Math.round(fromKg(lift.weight.value, units))} ${u}` : ""}{lift.weight && lift.reps ? " · " : ""}{lift.reps ? `Most reps ${lift.reps.value}` : ""}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Num size={26} style={{ color: top ? colors.lime : colors.textPrimary }}>{best ? Math.round(fromKg(best.value, units)) : "—"}</Num>
            <Label>{lift.e1rm ? `EST. 1RM ${u.toUpperCase()}` : `BEST ${u.toUpperCase()}`}</Label>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {pts.length > 1 ? <Sparkline data={pts} width={90} height={28} /> : null}
          {gain > 0 ? <View style={{ paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: "rgba(216,255,99,0.12)", justifyContent: "center" }}><Text variant="meta" style={{ color: colors.lime }}>+{gain}% since first log</Text></View> : null}
          <Text variant="meta" color="tertiary" style={{ marginLeft: "auto" }}>{new Date(lift.latest).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
        </View>
        {c && !c.insufficient_data && !c.no_pr && c.percentile != null ? (
          <View style={{ gap: 4 }}>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)" }}><View style={{ width: `${c.percentile}%`, height: 5, borderRadius: 3, backgroundColor: colors.cyan }} /></View>
            <Text variant="meta" color="tertiary">Top {100 - c.percentile}% · {c.cohortSize} Forma users</Text>
          </View>
        ) : null}
      </SoftSurface>
    </Pressable>
  );
}
