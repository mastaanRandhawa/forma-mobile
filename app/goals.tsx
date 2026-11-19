/**
 * Goals (website: pages/Goals.tsx) — templates for common targets plus custom
 * goals, in-progress vs completed sections, quick logging, target edits.
 */
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useGoals } from "@/api/hooks";
import type { GoalCadence, GoalWithProgress } from "@/api/types";
import { useAuth } from "@/auth/auth-provider";
import { useTheme } from "@/theme/theme-provider";
import { gated } from "@/components/feature-gate";
import { GoalLogSheet } from "@/components/goal-log";
import { colors, radius, type Tone } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, Field, SectionHeading } from "@/components/ui/controls";
import { ActionMenu, EmptyState, ErrorState, PageHeader, PillTabs, RingValue, Sheet, Skel } from "@/components/ui/extra";
import { SoftSurface } from "@/components/ui/surface";
import { toast } from "@/components/ui/toast";
import { Label, Num, Text } from "@/components/ui/text";

const TONES: Tone[] = ["pink", "cyan", "lime", "amber", "mauve", "violet"];
const templatesFor = (metric: boolean) => [
  { key: "steps", label: "Daily steps", target: 10000, unit: "steps", cadence: "daily" as GoalCadence, tone: "cyan" },
  { key: "protein", label: "Protein", target: 160, unit: "g", cadence: "daily" as GoalCadence, tone: "lime" },
  { key: "sleep", label: "Sleep", target: 8, unit: "h", cadence: "daily" as GoalCadence, tone: "violet" },
  { key: "water", label: "Water", target: metric ? 3000 : 100, unit: metric ? "ml" : "oz", cadence: "daily" as GoalCadence, tone: "cyan" },
  { key: "weekly_workouts", label: "Weekly workouts", target: 4, unit: "sessions", cadence: "weekly" as GoalCadence, tone: "pink" },
  { key: "running", label: "Running distance", target: metric ? 25 : 15, unit: metric ? "km" : "mi", cadence: "weekly" as GoalCadence, tone: "amber" },
];
const fmt = (n: number) => (n >= 1000 ? n.toLocaleString() : n % 1 === 0 ? String(n) : n.toFixed(1));

function GoalsScreen() {
  useTheme();
  const { user } = useAuth();
  const goals = useGoals();
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState({ label: "", target: "", unit: "", cadence: "daily" as GoalCadence });
  const [busy, setBusy] = useState<string | null>(null);
  const [logGoal, setLogGoal] = useState<GoalWithProgress | null>(null);
  const [menu, setMenu] = useState<GoalWithProgress | null>(null);
  const [editing, setEditing] = useState<GoalWithProgress | null>(null);
  const [newTarget, setNewTarget] = useState("");

  const list = (goals.data ?? []).filter((g) => g.active);
  const existingKeys = new Set(list.map((g) => g.key));
  const inProgress = list.filter((g) => !(g.completed || g.current >= g.target));
  const done = list.filter((g) => g.completed || g.current >= g.target);
  const templates = templatesFor(user?.unitPreference === "metric");

  const create = async (g: { key: string; label: string; target: number; unit: string; cadence: GoalCadence; tone?: string }) => {
    setBusy(g.key);
    try {
      await api.goals.upsert({ ...g, tone: g.tone ?? TONES[list.length % TONES.length] });
      invalidateResource("goals");
      invalidateResource("dashboard");
      goals.refetch();
      setAdding(false);
      setCustom({ label: "", target: "", unit: "", cadence: "daily" });
      toast.success(`${g.label} goal added`);
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(null);
    }
  };

  const remove = (g: GoalWithProgress) =>
    Alert.alert("Remove goal?", `"${g.label}" and its progress will be removed.`, [
      { text: "Keep it", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { try { await api.goals.remove(g.id); goals.mutate((goals.data ?? []).filter((x) => x.id !== g.id)); invalidateResource("dashboard"); toast.success("Goal removed"); } catch (e) { toast.error(errorMessage(e as Error)); } } },
    ]);

  const card = (g: GoalWithProgress) => {
    const pct = g.target ? (g.current / g.target) * 100 : 0;
    const complete = g.completed || g.current >= g.target;
    const tone = (TONES.includes(g.tone as Tone) ? g.tone : "pink") as Tone;
    return (
      <Pressable key={g.id} onPress={() => setLogGoal(g)} onLongPress={() => setMenu(g)} accessibilityHint="Tap to log, long-press for options">
        <SoftSurface style={{ padding: 16, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <RingValue pct={pct} size={52} stroke={5} tone={tone} color={complete ? colors.lime : undefined}>
              {complete ? <Ionicons name="checkmark" size={20} color={colors.lime} /> : <Text variant="meta" color="secondary">{Math.round(Math.min(100, pct))}%</Text>}
            </RingValue>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16 }} numberOfLines={1}>{g.label}</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                <Num size={20}>{fmt(g.current)}</Num>
                <Text color="tertiary">/ {fmt(g.target)} {g.unit}</Text>
              </View>
              <Text variant="meta" style={{ color: complete ? colors.lime : colors.textTertiary }}>{complete ? `Done ${g.cadence === "daily" ? "today" : "this week"}` : `${fmt(Math.max(0, g.target - g.current))} ${g.unit} to go · ${g.cadence}`}</Text>
            </View>
            <Pressable onPress={() => setMenu(g)} hitSlop={10} accessibilityLabel={`Options for ${g.label}`}><Ionicons name="ellipsis-horizontal" size={20} color={colors.textTertiary} /></Pressable>
          </View>
        </SoftSurface>
      </Pressable>
    );
  };

  return (
    <Screen refreshing={goals.loading && !goals.initialLoading} onRefresh={goals.refetch}>
      <PageHeader title="Goals" subtitle="What you're working toward." right={<Chip label="+ New goal" active onPress={() => setAdding(true)} />} />
      {goals.initialLoading ? [0, 1, 2].map((i) => <Skel key={i} h={84} r={32} style={{ marginBottom: 10 }} />) : goals.error && !goals.data ? (
        <ErrorState message={errorMessage(goals.error)} onRetry={goals.refetch} />
      ) : list.length === 0 ? (
        <EmptyState title="No goals yet" body="A goal turns your numbers into progress. Start with steps, protein or a weekly training target." action="Add your first goal" onAction={() => setAdding(true)} />
      ) : (
        <>
          {inProgress.length ? <><Label style={{ marginBottom: 8 }}>IN PROGRESS · {inProgress.length}</Label>{inProgress.map(card)}</> : <EmptyState title="Everything's done" body="Every goal is complete for this period. Add another target or take the win." action="Add a goal" onAction={() => setAdding(true)} />}
          {done.length ? <><Label style={{ marginTop: 10, marginBottom: 8 }}>COMPLETED · {done.length}</Label>{done.map(card)}</> : null}
          <Text variant="meta" color="tertiary" style={{ textAlign: "center", marginTop: 6 }}>Tap a goal to log progress · completing one earns coins.</Text>
        </>
      )}

      <Sheet visible={adding} onClose={() => setAdding(false)} title="New goal">
        <SectionHeading title="Templates" />
        {templates.map((t) => {
          const has = existingKeys.has(t.key);
          return (
            <Pressable key={t.key} disabled={has || !!busy} onPress={() => create(t)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.small, backgroundColor: colors.surface, opacity: has ? 0.5 : 1 }}>
              <View style={{ flex: 1 }}>
                <Text>{t.label}</Text>
                <Text variant="meta" color="tertiary">{t.target.toLocaleString()} {t.unit} · {t.cadence}</Text>
              </View>
              {has ? <Text variant="meta" color="tertiary">Added</Text> : busy === t.key ? <Text variant="meta" color="tertiary">Adding…</Text> : <Ionicons name="add-circle-outline" size={22} color={colors.textSecondary} />}
            </Pressable>
          );
        })}
        <SectionHeading title="Custom" />
        <Field label="name" value={custom.label} onChangeText={(label) => setCustom((c) => ({ ...c, label }))} placeholder="Mobility minutes" maxLength={40} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="target" value={custom.target} onChangeText={(target) => setCustom((c) => ({ ...c, target }))} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="unit" value={custom.unit} onChangeText={(unit) => setCustom((c) => ({ ...c, unit }))} placeholder="min" maxLength={12} /></View>
        </View>
        <PillTabs value={custom.cadence} onChange={(cadence) => setCustom((c) => ({ ...c, cadence }))} options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" }]} />
        <Button label="Save goal" loading={busy === "custom"} disabled={!custom.label.trim() || !(parseFloat(custom.target) > 0)} onPress={() => create({ key: `custom-${custom.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, label: custom.label.trim(), target: parseFloat(custom.target), unit: custom.unit.trim() || "×", cadence: custom.cadence })} />
      </Sheet>

      <GoalLogSheet goal={logGoal} onClose={() => setLogGoal(null)} onLogged={(g) => goals.mutate((goals.data ?? []).map((x) => (x.id === g.id ? { ...x, ...g } : x)))} />
      <ActionMenu
        visible={!!menu}
        onClose={() => setMenu(null)}
        title={menu?.label}
        actions={menu ? [
          { label: "Log progress", icon: "add-circle-outline", onPress: () => setLogGoal(menu) },
          { label: "Change target", icon: "create-outline", onPress: () => { setEditing(menu); setNewTarget(String(menu.target)); } },
          { label: "Remove goal", icon: "trash-outline", destructive: true, onPress: () => remove(menu) },
        ] : []}
      />
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.label} target` : ""} footer={<Button label="Save target" disabled={!(parseFloat(newTarget) > 0)} onPress={() => editing && create({ key: editing.key, label: editing.label, target: parseFloat(newTarget), unit: editing.unit, cadence: editing.cadence, tone: editing.tone }).then(() => setEditing(null))} />}>
        <Field label={`target (${editing?.unit ?? ""})`} value={newTarget} onChangeText={setNewTarget} keyboardType="decimal-pad" autoFocus />
      </Sheet>
    </Screen>
  );
}

export default gated("goals", GoalsScreen);
