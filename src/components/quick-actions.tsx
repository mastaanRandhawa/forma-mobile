/**
 * Floating quick-action button on Home (website: layout/QuickActions.tsx):
 * start a workout, log food, log bodyweight, add water, daily check-in.
 * Actions fan out upward with a staggered spring over a dimmed backdrop.
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, TextInput, View } from "react-native";
import RAnimated, { useAnimatedStyle } from "react-native-reanimated";
import { useNavChrome } from "./nav-chrome";
import { useTheme } from "@/theme/theme-provider";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useGoals } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import { grantGoalReward } from "@/lib/rewards";
import { toKg } from "@/lib/workouts";
import { colors, fonts, radius, shadow } from "@/theme/tokens";
import { CheckinSheet, useTodayCheckin } from "./checkin";
import { Button } from "./ui/controls";
import { Sheet } from "./ui/extra";
import { toast } from "./ui/toast";
import { Text } from "./ui/text";

type ActionId = "workout" | "food" | "weight" | "water" | "checkin";
const ACTIONS: { id: ActionId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "workout", label: "Start workout", icon: "barbell-outline" },
  { id: "food", label: "Log food", icon: "restaurant-outline" },
  { id: "weight", label: "Log weight", icon: "scale-outline" },
  { id: "water", label: "Add water", icon: "water-outline" },
  { id: "checkin", label: "Daily check-in", icon: "moon-outline" },
];

export function QuickActions({ bottom }: { bottom: number }) {
  useTheme();
  const router = useRouter();
  const nav = useNavChrome();
  const { user, refreshUser } = useAuth();
  const metric = user?.unitPreference === "metric";
  const goals = useGoals();
  const today = useTodayCheckin();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<null | "weight" | "water" | "checkin">(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: open ? 1 : 0, useNativeDriver: true, stiffness: 320, damping: 24 }).start();
  }, [open, a]);

  // sits level with the tab pill; drops 6px as the pill shrinks so both stay bottom-aligned
  const dockPos = useAnimatedStyle(() => ({ bottom: bottom + 6 * (1 - nav.minimized.value) }));

  const water = (goals.data ?? []).find((g) => g.active && (g.key === "water" || /water/i.test(g.label)));
  const waterUnit = water?.unit ?? (metric ? "ml" : "oz");

  const pick = (id: ActionId) => {
    Haptics.selectionAsync().catch(() => {});
    setOpen(false);
    if (id === "workout") return router.push("/workouts");
    if (id === "food") return router.push({ pathname: "/nutrition", params: { add: "1" } });
    setVal("");
    setSheet(id);
  };

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
          if (updated.completed && !goal.completed) void grantGoalReward(goal.id, updated.periodKey, goal.label);
          toast.success(`+${n} ${goal.unit} water · ${updated.current}/${updated.target}`);
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
    <>
      {open ? <Pressable onPress={() => setOpen(false)} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(10,4,9,0.45)" }} accessibilityLabel="Close quick actions" /> : null}
      <RAnimated.View pointerEvents="box-none" style={[{ position: "absolute", right: 16, alignItems: "flex-end", gap: 10 }, dockPos]}>
        {ACTIONS.map((act, i) => {
          const k = ACTIONS.length - i;
          return (
            <Animated.View
              key={act.id}
              pointerEvents={open ? "auto" : "none"}
              style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12 * k, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}
            >
              <Pressable onPress={() => pick(act.id)} accessibilityRole="button" style={[{ flexDirection: "row", alignItems: "center", gap: 10, height: 42, paddingLeft: 14, paddingRight: 16, borderRadius: radius.pill, backgroundColor: colors.surfaceOpaque, borderWidth: 1, borderColor: colors.lineSoft }, shadow.float]}>
                <Ionicons name={act.icon} size={16} color={colors.pink} />
                <Text style={{ fontSize: 14 }}>{act.label}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setOpen((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityLabel={open ? "Close quick actions" : "Quick actions"}
          accessibilityState={{ expanded: open }}
          style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.pink, alignItems: "center", justifyContent: "center" }}
        >
          <Animated.View style={{ transform: [{ rotate: a.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] }) }] }}>
            <Ionicons name="add" size={26} color={colors.onAccent} />
          </Animated.View>
        </Pressable>
      </RAnimated.View>

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
    </>
  );
}
