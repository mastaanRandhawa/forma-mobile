import { ProfileMenu } from "@/components/profile-menu";
import { TourTarget } from "@/components/tour/tour";
/**
 * Nutrition (website: components/nutrition/FoodLog.tsx) — the food logger.
 * Today: date navigation + calendar, calorie ring and macros vs targets,
 * meals (swipe left to delete, tap to edit), quick add, copy yesterday.
 * Trends: last 14 logged days.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useResource } from "@/api/hooks";
import type { FoodDay, FoodLogEntry, MealType, NutritionGoalRow } from "@/api/types";
import { MEALS, MEAL_LABEL, addDaysISO, fmtDay, mealForNow, round, todayISO } from "@/lib/food";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { AddFoodSheet } from "@/components/nutrition/add-food";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, ProgressBar } from "@/components/ui/controls";
import { Card, Dial, EmptyState, ErrorState, PillTabs, Segmented, Sheet, Skel } from "@/components/ui/extra";
import { SoftSurface } from "@/components/ui/surface";
import { toast } from "@/components/ui/toast";
import { Label, Num, Text } from "@/components/ui/text";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function Nutrition() {
  useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const [tab, setTab] = useState<"today" | "trends">("today");
  const [date, setDate] = useState(todayISO());
  const day = useResource<FoodDay>(`food:day:${date}`, () => api.food.day(date));
  const [add, setAdd] = useState<{ open: boolean; meal: MealType; tab?: "search" | "manual" | "scan" }>({ open: false, meal: "breakfast" });
  const [edit, setEdit] = useState<FoodLogEntry | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const isToday = date === todayISO();

  // Home's quick action deep-links here with ?add=1
  useEffect(() => {
    if (params.add) {
      setTab("today");
      setDate(todayISO());
      setAdd({ open: true, meal: mealForNow() });
      router.setParams({ add: undefined });
    }
  }, [params.add, router]);

  const setDay = (d: FoodDay) => {
    day.mutate(d);
    invalidateResource("food:summary");
    invalidateResource("dashboard");
  };

  const remove = async (e: FoodLogEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const r = await api.food.deleteLog(e.id);
      setDay(r.day);
      toast.info(`${e.foodName} removed`, {
        label: "Undo",
        onPress: async () => {
          try {
            const input = e.source && e.sourceId ? { source: e.source, sourceId: e.sourceId, quantity: e.quantity, servingUnit: e.servingUnit as "serving" | "g" | "oz" } : { quickAdd: { name: e.foodName, calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat } };
            const back = await api.food.log({ ...input, mealType: e.mealType, date: e.date });
            setDay(back.day);
          } catch (err) {
            toast.error(errorMessage(err as Error));
          }
        },
      });
    } catch (err) {
      toast.error(errorMessage(err as Error));
    }
  };

  const copyPrev = () =>
    Alert.alert(isToday ? "Copy yesterday?" : "Copy the day before?", `Everything logged on ${fmtDay(addDaysISO(date, -1))} will be added to ${fmtDay(date)}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Copy",
        onPress: async () => {
          setCopying(true);
          try {
            const r = await api.food.copy({ fromDate: addDaysISO(date, -1), toDate: date });
            setDay(r.day);
            toast.success(r.copied ? `Copied ${r.copied} item${r.copied === 1 ? "" : "s"}` : "Nothing to copy from that day");
          } catch (e) {
            toast.error(errorMessage(e as Error));
          } finally {
            setCopying(false);
          }
        },
      },
    ]);

  const d = day.data;
  const total = d ? Object.values(d.meals).reduce((n, l) => n + (l?.length ?? 0), 0) : 0;

  return (
    <Screen tabs refreshing={day.loading && !day.initialLoading} onRefresh={day.refetch}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Text variant="title">Nutrition</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {tab === "today" ? <TourTarget id="nutrition-add"><Chip label="+ Add food" active onPress={() => setAdd({ open: true, meal: mealForNow() })} /></TourTarget> : null}
          <ProfileMenu />
        </View>
      </View>
      <Segmented value={tab} onChange={setTab} options={[{ value: "today", label: "Food log" }, { value: "trends", label: "Trends" }]} />

      {tab === "today" ? (
        <View style={{ marginTop: 14, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable hitSlop={12} onPress={() => setDate(addDaysISO(date, -1))} accessibilityLabel="Previous day" style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
              <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={() => setCalOpen(true)} accessibilityLabel="Pick a date" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="calendar-outline" size={15} color={colors.textSecondary} />
              <Text style={{ fontFamily: fonts.semibold }}>{cap(fmtDay(date))}</Text>
              {!isToday ? <Pressable onPress={() => setDate(todayISO())} hitSlop={8} style={{ marginLeft: 6, paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: colors.surface, justifyContent: "center" }}><Text variant="meta" color="pink">Today</Text></Pressable> : null}
            </Pressable>
            <Pressable hitSlop={12} onPress={() => setDate(addDaysISO(date, 1))} disabled={date >= addDaysISO(todayISO(), 1)} accessibilityLabel="Next day" style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, opacity: date >= addDaysISO(todayISO(), 1) ? 0.4 : 1 }}>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {day.initialLoading && !d ? <><Skel h={190} r={32} /><Skel h={140} r={32} /></> : null}
          {day.error && !d ? <ErrorState message={errorMessage(day.error)} onRetry={day.refetch} /> : null}

          {d ? (
            <>
              <DaySummary day={d} onAdjust={() => setGoalOpen(true)} />

              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text variant="section">Food log</Text>
                  {total ? <Text variant="meta" color="tertiary">Swipe left to delete</Text> : null}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 4 }}>
                  <Chip label="Quick add" onPress={() => setAdd({ open: true, meal: mealForNow(), tab: "manual" })} />
                  <Chip label="Scan barcode" onPress={() => setAdd({ open: true, meal: mealForNow(), tab: "scan" })} />
                  <Chip label={copying ? "Copying…" : `Copy ${isToday ? "yesterday" : "day before"}`} onPress={copyPrev} />
                </ScrollView>
              </View>
              {total === 0 ? <EmptyState title="Nothing logged yet" body={`Search a food, scan a barcode or add it manually for ${fmtDay(date)}.`} action="Add food" onAction={() => setAdd({ open: true, meal: mealForNow() })} /> : null}
              {MEALS.map((meal) => {
                const entries = d.meals[meal] ?? [];
                const kcal = Math.round(d.mealTotals[meal]?.calories ?? 0);
                return (
                  <View key={meal} style={{ gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                        <Text variant="cardTitle">{cap(MEAL_LABEL[meal])}</Text>
                        {entries.length ? <Num size={13} color="tertiary">{kcal} kcal</Num> : null}
                      </View>
                      <Pressable onPress={() => setAdd({ open: true, meal })} accessibilityRole="button" accessibilityLabel={`Add to ${MEAL_LABEL[meal]}`} hitSlop={4} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 }}>
                        <Ionicons name="add-circle-outline" size={24} color={colors.pinkSoft} />
                      </Pressable>
                    </View>
                    {entries.map((e) => <EntryRow key={e.id} e={e} onEdit={() => setEdit(e)} onDelete={() => remove(e)} />)}
                  </View>
                );
              })}

              <Text variant="meta" color="tertiary" style={{ textAlign: "center" }}>
                Food data from <Text variant="meta" color="secondary" onPress={() => Linking.openURL("https://world.openfoodfacts.org")}>Open Food Facts</Text> (ODbL) and <Text variant="meta" color="secondary" onPress={() => Linking.openURL("https://fdc.nal.usda.gov")}>USDA FoodData Central</Text>, with Nutritionix and Edamam as fallbacks.
              </Text>
            </>
          ) : null}
        </View>
      ) : (
        <Trends onLog={() => setTab("today")} />
      )}

      <AddFoodSheet open={add.open} meal={add.meal} date={date} initialTab={add.tab ?? "search"} onClose={() => setAdd((s) => ({ ...s, open: false, tab: undefined }))} onLogged={(nd) => { setDay(nd); setAdd((s) => ({ ...s, open: false, tab: undefined })); }} />
      <EditEntrySheet entry={edit} onClose={() => setEdit(null)} onUpdated={(nd) => { setDay(nd); setEdit(null); }} />
      <GoalSheet visible={goalOpen} current={d?.goal ?? null} onClose={() => setGoalOpen(false)} onSaved={() => { setGoalOpen(false); day.refetch(); }} />
      <CalendarSheet visible={calOpen} value={date} max={addDaysISO(todayISO(), 1)} onClose={() => setCalOpen(false)} onPick={(v) => { setDate(v); setCalOpen(false); }} />
    </Screen>
  );
}

function DaySummary({ day, onAdjust }: { day: FoodDay; onAdjust: () => void }) {
  const { totals, goal, remaining } = day;
  const kcalGoal = goal?.dailyCalories ?? 0;
  const left = remaining?.calories ?? null;
  const over = left != null && left < 0;
  const macros: [string, number, number | null, "lime" | "cyan" | "amber"][] = [
    ["Protein", totals.protein, goal?.proteinGrams ?? null, "lime"],
    ["Carbs", totals.carbs, goal?.carbGrams ?? null, "cyan"],
    ["Fat", totals.fat, goal?.fatGrams ?? null, "amber"],
  ];
  return (
    <Card variant="hero" style={{ gap: 18, marginBottom: 0 }}>
      <TourTarget id="nutrition-summary">
      <View style={{ alignItems: "center", gap: 14 }}>
        <Dial pct={kcalGoal ? (totals.calories / kcalGoal) * 100 : 0} size={176} tone={over ? "amber" : "pink"}>
          <Num size={38}>{left == null ? Math.round(totals.calories) : Math.abs(left)}</Num>
          <Text variant="meta" color="secondary">{left == null ? "kcal eaten" : over ? "kcal over" : "kcal remaining"}</Text>
        </Dial>
        <View style={{ flexDirection: "row", gap: 28 }}>
          <View style={{ alignItems: "center", gap: 2 }}><Num size={18}>{Math.round(totals.calories)}</Num><Text variant="meta" color="tertiary">Eaten</Text></View>
          <View style={{ alignItems: "center", gap: 2 }}><Num size={18}>{kcalGoal || "—"}</Num><Text variant="meta" color="tertiary">Target</Text></View>
        </View>
      </View>
      </TourTarget>
      <View style={{ flexDirection: "row", gap: 16 }}>
        {macros.map(([l, have, want, tone]) => (
          <View key={l} style={{ flex: 1, gap: 6 }}>
            <Text variant="meta" color="secondary">{l}</Text>
            <Num size={18}>{round(have)}<Text variant="meta" color="tertiary">{want ? ` / ${want} g` : " g"}</Text></Num>
            <ProgressBar pct={want ? (have / want) * 100 : 0} tone={tone} height={6} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text variant="meta" color="tertiary" style={{ flex: 1 }}>
          {goal?.fiberGrams ? `Fiber ${round(totals.fiber ?? 0)} / ${goal.fiberGrams} g` : left == null ? "Set a calorie target to see what's remaining." : " "}
        </Text>
        <Button label={goal ? "Adjust targets" : "Set targets"} variant="text" size="sm" onPress={onAdjust} />
      </View>
    </Card>
  );
}

function DeleteAction({ prog, name, onDelete }: { prog: SharedValue<number>; name: string; onDelete: () => void }) {
  // hidden until the row is actually dragged, since the row itself has no opaque background
  const fade = useAnimatedStyle(() => ({ opacity: Math.min(1, prog.get() * 6) }));
  return (
    <Animated.View style={[{ width: 84, marginLeft: 8, marginVertical: 4 }, fade]}>
      <Pressable onPress={onDelete} accessibilityLabel={`Delete ${name}`} style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger, borderRadius: radius.small }}>
        <Ionicons name="trash-outline" size={18} color="#fff" />
        <Text variant="meta" style={{ color: "#fff" }}>Delete</Text>
      </Pressable>
    </Animated.View>
  );
}

function EntryRow({ e, onEdit, onDelete }: { e: FoodLogEntry; onEdit: () => void; onDelete: () => void }) {
  const qty = e.servingUnit === "g" || e.servingUnit === "oz" ? `${round(e.quantity)} ${e.servingUnit}` : `${round(e.quantity, 2)} serving${round(e.quantity, 2) === 1 ? "" : "s"}${e.grams ? ` · ${Math.round(e.grams)} g` : ""}`;
  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={60}
      overshootRight={false}
      renderRightActions={(prog) => <DeleteAction prog={prog} name={e.foodName} onDelete={() => Alert.alert("Remove this food?", `${e.foodName} will be removed from your log.`, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: onDelete }])} />}
      onSwipeableOpen={() => Haptics.selectionAsync().catch(() => {})}
    >
      <Pressable onPress={onEdit} onLongPress={() => Alert.alert(e.foodName, undefined, [{ text: "Cancel", style: "cancel" }, { text: "Edit", onPress: onEdit }, { text: "Delete", style: "destructive", onPress: onDelete }])} accessibilityHint="Tap to edit, swipe left to delete" style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingVertical: 8 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1}>{e.foodName}{e.brand ? <Text color="tertiary"> · {e.brand}</Text> : null}</Text>
          <Text variant="meta" color="tertiary">{qty} · P {round(e.protein)} · C {round(e.carbs)} · F {round(e.fat)}</Text>
        </View>
        <Num size={15} color="secondary">{Math.round(e.calories)}</Num>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

function EditEntrySheet({ entry, onClose, onUpdated }: { entry: FoodLogEntry | null; onClose: () => void; onUpdated: (d: FoodDay) => void }) {
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState<"serving" | "g" | "oz">("serving");
  const [meal, setMeal] = useState<MealType>("breakfast");
  const [busy, setBusy] = useState<"save" | "del" | null>(null);
  useEffect(() => {
    if (!entry) return;
    setQty(String(round(entry.quantity, 2)));
    setUnit((entry.servingUnit as "serving" | "g" | "oz") ?? "serving");
    setMeal(entry.mealType);
  }, [entry]);
  const canServing = Boolean(entry?.foodId) || entry?.servingUnit === "serving";
  const run = async (kind: "save" | "del") => {
    if (!entry) return;
    setBusy(kind);
    try {
      const r = kind === "save" ? await api.food.updateLog(entry.id, { quantity: Number.parseFloat(qty.replace(",", ".")) || 1, servingUnit: unit, mealType: meal }) : await api.food.deleteLog(entry.id);
      toast.success(kind === "save" ? "Entry updated" : `${entry.foodName} removed`);
      onUpdated(r.day);
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet
      visible={!!entry}
      onClose={onClose}
      eyebrow="Edit entry"
      title={entry?.foodName}
      footer={
        <>
          <Button label="Save changes" loading={busy === "save"} onPress={() => run("save")} />
          <Pressable onPress={() => Alert.alert("Delete this entry?", `${entry?.foodName ?? "This food"} will be removed from your log.`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void run("del") }])} disabled={!!busy} style={{ alignItems: "center", paddingVertical: 8 }}><Text style={{ color: colors.danger }}>{busy === "del" ? "Deleting…" : "Delete entry"}</Text></Pressable>
        </>
      }
    >
      {entry?.foodId ? <Text variant="meta" color="tertiary">Nutrition updates when you change the amount. Quick-add entries keep their numbers.</Text> : null}
      <Label>AMOUNT</Label>
      <TextInput value={qty} onChangeText={setQty} keyboardType="decimal-pad" selectTextOnFocus style={{ height: 52, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 16, color: colors.textPrimary, fontFamily: fonts.num, fontSize: 20 }} />
      <Label>UNIT</Label>
      <PillTabs value={unit} onChange={setUnit} options={(canServing ? (["serving", "g", "oz"] as const) : (["g", "oz"] as const)).map((x) => ({ value: x, label: x === "serving" ? "Serving" : x }))} />
      <Label>MEAL</Label>
      <PillTabs value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m, label: cap(MEAL_LABEL[m]) }))} />
    </Sheet>
  );
}

function GoalSheet({ visible, current, onClose, onSaved }: { visible: boolean; current: NutritionGoalRow | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ dailyCalories: "", proteinGrams: "", carbGrams: "", fatGrams: "", fiberGrams: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const s = (n: number | null | undefined) => (n == null ? "" : String(n));
    setV({ dailyCalories: s(current?.dailyCalories), proteinGrams: s(current?.proteinGrams), carbGrams: s(current?.carbGrams), fatGrams: s(current?.fatGrams), fiberGrams: s(current?.fiberGrams) });
  }, [visible, current]);
  const n = (s: string): number | null => {
    const x = Number.parseFloat(s.replace(",", "."));
    return Number.isFinite(x) && x >= 0 ? x : null;
  };
  // macro calories vs the kcal target — a gentle consistency hint, not a rule
  const macroKcal = (n(v.proteinGrams) ?? 0) * 4 + (n(v.carbGrams) ?? 0) * 4 + (n(v.fatGrams) ?? 0) * 9;
  const kcal = n(v.dailyCalories);
  const save = async () => {
    setBusy(true);
    try {
      await api.food.setGoal({ dailyCalories: kcal == null ? null : Math.round(kcal), proteinGrams: n(v.proteinGrams), carbGrams: n(v.carbGrams), fatGrams: n(v.fatGrams), fiberGrams: n(v.fiberGrams) });
      invalidateResource("dashboard");
      toast.success("Targets saved");
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(false);
    }
  };
  const fields: [keyof typeof v, string][] = [["dailyCalories", "Calories (kcal)"], ["proteinGrams", "Protein (g)"], ["carbGrams", "Carbs (g)"], ["fatGrams", "Fat (g)"], ["fiberGrams", "Fiber (g) · optional"]];
  return (
    <Sheet visible={visible} onClose={onClose} title="Daily targets" eyebrow="You set these" footer={<Button label="Save targets" loading={busy} onPress={save} />}>
      <Text color="secondary">Enter your own daily targets. Nothing here is a medical recommendation — set what you're aiming for and leave the rest blank.</Text>
      {fields.map(([key, label]) => (
        <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ flex: 1 }}>{label}</Text>
          <TextInput value={v[key]} onChangeText={(t) => setV((s) => ({ ...s, [key]: t }))} keyboardType="decimal-pad" placeholder="—" placeholderTextColor={colors.textTertiary} style={{ width: 110, height: 46, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.num, fontSize: 17, textAlign: "right" }} />
        </View>
      ))}
      {kcal && macroKcal > 0 && Math.abs(macroKcal - kcal) / kcal > 0.15 ? <Text variant="meta" style={{ color: colors.amber }}>Your macros add up to about {Math.round(macroKcal)} kcal — {macroKcal > kcal ? "more" : "less"} than your calorie target.</Text> : null}
    </Sheet>
  );
}

function CalendarSheet({ visible, value, max, onClose, onPick }: { visible: boolean; value: string; max: string; onClose: () => void; onPick: (iso: string) => void }) {
  const [month, setMonth] = useState(() => new Date(value + "T12:00:00"));
  useEffect(() => {
    if (visible) setMonth(new Date(value + "T12:00:00"));
  }, [visible, value]);
  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const iso = (dd: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const cells = Array.from({ length: Math.ceil((first + dim) / 7) * 7 }, (_, i) => i - first + 1);
  return (
    <Sheet visible={visible} onClose={onClose} title="Pick a day">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => setMonth(new Date(y, m - 1, 1))} hitSlop={12} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={20} color={colors.textSecondary} /></Pressable>
        <Text style={{ fontFamily: fonts.semibold }}>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
        <Pressable onPress={() => setMonth(new Date(y, m + 1, 1))} disabled={iso(1) > max} hitSlop={12} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={20} color={iso(1) > max ? colors.lineHighlight : colors.textSecondary} /></Pressable>
      </View>
      <View style={{ flexDirection: "row" }}>{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Text key={i} variant="meta" color="tertiary" style={{ flex: 1, textAlign: "center" }}>{d}</Text>)}</View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((dd, i) => {
          const inM = dd >= 1 && dd <= dim;
          const id = inM ? iso(dd) : "";
          const disabled = !inM || id > max;
          const sel = id === value;
          const today = id === todayISO();
          return (
            <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              {inM ? (
                <Pressable disabled={disabled} onPress={() => onPick(id)} style={{ flex: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: sel ? colors.pink : "transparent", borderWidth: today && !sel ? 1 : 0, borderColor: colors.lineHighlight, opacity: disabled ? 0.3 : 1 }}>
                  <Text variant="meta" style={{ color: sel ? colors.onColor : colors.textSecondary }}>{dd}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

function Trends({ onLog }: { onLog: () => void }) {
  const res = useResource<{ date: string; calories: number; protein: number }[]>("food:summary:14", () => api.food.summary(14).then((r) => r.days));
  const data = res.data;
  const stats = useMemo(() => {
    if (!data?.length) return null;
    const maxK = Math.max(1, ...data.map((d) => d.calories));
    return { maxK, avgK: Math.round(data.reduce((s, d) => s + d.calories, 0) / data.length), avgP: Math.round(data.reduce((s, d) => s + d.protein, 0) / data.length) };
  }, [data]);
  if (res.error && !data) return <View style={{ marginTop: 14 }}><ErrorState message={errorMessage(res.error)} onRetry={res.refetch} /></View>;
  if (!data) return <View style={{ marginTop: 14, gap: 12 }}><Skel h={80} r={24} /><Skel h={260} r={32} /></View>;
  if (data.length < 3) return <View style={{ marginTop: 14 }}><EmptyState title="Not enough history yet" body={`Trends appear after three logged days — you have ${data.length}.`} action="Log food" onAction={onLog} /></View>;
  return (
    <View style={{ marginTop: 14, gap: 14 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[["AVG CALORIES", `${stats!.avgK}`], ["AVG PROTEIN", `${stats!.avgP} g`]].map(([l, v]) => (
          <SoftSurface key={l} style={{ flex: 1, padding: 16, gap: 6 }}><Num size={26}>{v}</Num><Label>{l}</Label></SoftSurface>
        ))}
      </View>
      <SoftSurface style={{ padding: 16, gap: 10 }}>
        <Label>LAST {data.length} LOGGED DAYS</Label>
        {data.map((d) => (
          <View key={d.date} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text variant="meta" color="secondary" style={{ width: 86 }}>{cap(fmtDay(d.date))}</Text>
            <View style={{ flex: 1 }}><ProgressBar pct={(d.calories / stats!.maxK) * 100} tone="pink" height={8} /></View>
            <Num size={12} color="tertiary" style={{ width: 80, textAlign: "right" }}>{Math.round(d.calories)} · {Math.round(d.protein)}p</Num>
          </View>
        ))}
      </SoftSurface>
    </View>
  );
}
