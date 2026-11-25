/**
 * Quick logging — weight, water and the daily check-in — as contextual actions.
 * The old global floating "+" is gone: <QuickLogRow/> sits on Home, Start workout
 * lives on Home/Train, Log food on Nutrition (and Kai's menu). One provider owns
 * the sheets so any screen can open them via useQuickLog().
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useTheme } from "@/theme/theme-provider";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useGoals } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import { toKg } from "@/lib/workouts";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { CheckinSheet, useTodayCheckin } from "./checkin";
import { Button, Chip } from "./ui/controls";
import { Sheet } from "./ui/extra";
import { toast } from "./ui/toast";
import { Text } from "./ui/text";

type QuickLog = { weight: () => void; water: () => void; checkin: () => void };
const Ctx = createContext<QuickLog>({ weight: () => {}, water: () => {}, checkin: () => {} });
export const useQuickLog = () => useContext(Ctx);

/** The four quick actions as one compact, scrollable chip row. */
export function QuickLogRow({ bleed = true }: { bleed?: boolean }) {
  const q = useQuickLog();
  const router = useRouter();
  const go = (fn: () => void) => () => { Haptics.selectionAsync().catch(() => {}); fn(); };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={bleed ? { marginHorizontal: -space.page } : undefined} contentContainerStyle={{ gap: 8, paddingHorizontal: bleed ? space.page : 0, paddingVertical: 2 }}>
      <Chip label="Log food" onPress={go(() => router.push({ pathname: "/nutrition", params: { add: "1" } }))} />
      <Chip label="Log weight" onPress={go(q.weight)} />
      <Chip label="Add water" onPress={go(q.water)} />
      <Chip label="Daily check-in" onPress={go(q.checkin)} />
    </ScrollView>
  );
}

export function QuickLogProvider({ children }: { children: ReactNode }) {
  useTheme();
  const { user, refreshUser } = useAuth();
  const metric = user?.unitPreference === "metric";
  const goals = useGoals();
  const today = useTodayCheckin();
  const [sheet, setSheet] = useState<null | "weight" | "water" | "checkin">(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const water = (goals.data ?? []).find((g) => g.active && (g.key === "water" || /water/i.test(g.label)));
  const waterUnit = water?.unit ?? (metric ? "ml" : "oz");

  const openSheet = (id: "weight" | "water" | "checkin") => () => {
    setVal("");
    setSheet(id);
  };
  const api_ = { weight: openSheet("weight"), water: openSheet("water"), checkin: openSheet("checkin") };

  const save = async () => {
    const n = Number(val.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    setBusy(true);
    try {
      if (sheet === "weight") {
        const kg = toKg(n, metric ? "metric" : "imperial");
        await api.progress.addMeasurement({ weightKg: kg });
        await api.me.update({ weightKg: kg }).catch(() => {});
        void refreshUser();
        invalidateResource("measurements");
        toast.success(`Weight logged · ${n} ${metric ? "kg" : "lb"}`);
      } else if (sheet === "water") {
        let goal = water;
        if (!goal) {
          await api.goals.upsert({ key: "water", label: "Water", target: metric ? 3000 : 100, unit: metric ? "ml" : "oz", cadence: "daily", tone: "cyan" });
          const list = await api.goals.list();
          goals.mutate(list);
          goal = list.find((g) => g.key === "water");
        }
        if (goal) {
          const updated = await api.goals.log(goal.id, n, "increment");
          if (updated.coins) toast.coins(updated.coins, `${goal.label} complete`);
          else toast.success(`+${n} ${goal.unit} water · ${updated.current}/${updated.target}`);
        }
        invalidateResource("goals");
        goals.refetch();
      }
      setSheet(null);
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Ctx.Provider value={api_}>
      {children}
      <Sheet
        visible={sheet === "weight" || sheet === "water"}
        onClose={() => setSheet(null)}
        eyebrow="Quick log"
        title={sheet === "weight" ? "Log weight" : "Add water"}
        footer={<Button label="Save" variant="accent" loading={busy} disabled={!(Number(val.replace(",", ".")) > 0)} onPress={save} />}
      >
        {sheet === "water" && !water ? <Text color="secondary">This also starts a daily water goal ({metric ? "3,000 ml" : "100 oz"}) so you can track it on Home and in Goals.</Text> : null}
        {sheet === "water" && water ? <Text color="secondary">Today: {water.current} / {water.target} {water.unit}</Text> : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
          <TextInput
            autoFocus
            value={val}
            onChangeText={setVal}
            keyboardType="decimal-pad"
            placeholder={sheet === "weight" ? (metric ? "80" : "178") : metric ? "500" : "16"}
            placeholderTextColor={colors.textTertiary}
            onSubmitEditing={save}
            style={{ minWidth: 140, fontFamily: fonts.num, fontSize: 44, color: colors.textPrimary, borderBottomWidth: 1, borderBottomColor: colors.lineHighlight, paddingBottom: 4 }}
          />
          <Text color="tertiary" style={{ marginBottom: 10 }}>{sheet === "weight" ? (metric ? "kg" : "lb") : waterUnit}</Text>
        </View>
        {sheet === "water" ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(waterUnit === "ml" ? [250, 500, 750] : [8, 16, 24]).map((q) => (
              <Pressable key={q} onPress={() => setVal(String(q))} style={{ paddingHorizontal: 14, height: 34, borderRadius: radius.pill, backgroundColor: colors.surface, justifyContent: "center" }}>
                <Text variant="meta" color="secondary">+{q} {waterUnit}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Sheet>
      <CheckinSheet visible={sheet === "checkin"} onClose={() => setSheet(null)} seed={today.latest} onSaved={() => today.refetch()} />
    </Ctx.Provider>
  );
}
