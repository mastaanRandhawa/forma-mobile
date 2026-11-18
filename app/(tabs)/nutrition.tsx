import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "@/api/client";
import { errorMessage, useResource } from "@/api/hooks";
import type { FavoriteFood, Food, FoodDay, FoodLogEntry, FoodSearchResult, MealType, RecentFood } from "@/api/types";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, Field, ProgressBar, SectionHeading } from "@/components/ui/controls";
import { Card, Dial, EmptyState, ErrorState, PageSkeleton, Segmented, Sheet } from "@/components/ui/extra";
import { Label, Num, Text } from "@/components/ui/text";

const MEALS: { id: MealType; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snack", label: "Snacks" },
];
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shift = (date: string, n: number) => iso(new Date(new Date(`${date}T12:00:00`).getTime() + n * 864e5));
const dayLabel = (date: string) => (date === iso(new Date()) ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));

type AddTab = "search" | "recent" | "favorites" | "quick" | "scan";

export default function Nutrition() {
  useTheme();
  const [date, setDate] = useState(iso(new Date()));
  const day = useResource<FoodDay>(`food-day:${date}`, () => api.food.day(date));
  const [meal, setMeal] = useState<MealType | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

  const t = day.data?.totals;
  const goal = day.data?.goal;
  const calGoal = goal?.dailyCalories ?? null;

  const remove = (e: FoodLogEntry) =>
    Alert.alert("Remove entry?", e.foodName, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: async () => { await api.food.deleteLog(e.id).catch(() => {}); day.refetch(); } }]);

  if (day.initialLoading) return <Screen tabs><Text variant="title">Nutrition</Text><PageSkeleton /></Screen>;

  return (
    <Screen tabs refreshing={false} onRefresh={day.refetch}>
      <Text variant="title" style={{ marginBottom: 12 }}>Nutrition</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Pressable hitSlop={12} onPress={() => setDate(shift(date, -1))}><Ionicons name="chevron-back" size={22} color={colors.textSecondary} /></Pressable>
        <Text>{dayLabel(date)}</Text>
        <Pressable hitSlop={12} onPress={() => setDate(shift(date, 1))} disabled={date >= iso(new Date())}><Ionicons name="chevron-forward" size={22} color={date >= iso(new Date()) ? colors.textTertiary : colors.textSecondary} /></Pressable>
      </View>

      {day.error ? <ErrorState message={errorMessage(day.error)} onRetry={day.refetch} /> : null}

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
          <Dial pct={calGoal ? ((t?.calories ?? 0) / calGoal) * 100 : 0} size={116} tone="pink">
            <Num size={24}>{Math.round(t?.calories ?? 0)}</Num>
            <Text variant="meta" color="tertiary">{calGoal ? `of ${calGoal}` : "kcal"}</Text>
          </Dial>
          <View style={{ flex: 1, gap: 10 }}>
            {([["Protein", t?.protein, goal?.proteinGrams, "pink"], ["Carbs", t?.carbs, goal?.carbGrams, "cyan"], ["Fat", t?.fat, goal?.fatGrams, "amber"]] as const).map(([l, v, g, tone]) => (
              <View key={l} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text variant="meta" color="secondary">{l}</Text><Num size={13} color="secondary">{Math.round(v ?? 0)}{g ? ` / ${g}` : ""} g</Num></View>
                <ProgressBar pct={g ? ((v ?? 0) / g) * 100 : 0} tone={tone} height={6} />
              </View>
            ))}
          </View>
        </View>
        <View style={{ marginTop: 14 }}><Chip label={goal ? "Edit daily goal" : "Set daily goal"} onPress={() => setGoalOpen(true)} /></View>
      </Card>

      {MEALS.map((m) => {
        const entries = day.data?.meals?.[m.id] ?? [];
        const total = day.data?.mealTotals?.[m.id]?.calories ?? 0;
        return (
          <View key={m.id}>
            <SectionHeading title={m.label} action="+ Add" onAction={() => setMeal(m.id)} />
            <Card style={{ marginBottom: 6 }}>
              {entries.length === 0 ? <Text color="tertiary">Nothing logged.</Text> : entries.map((e) => (
                <Pressable key={e.id} onLongPress={() => remove(e)} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1}>{e.foodName}</Text>
                    <Text variant="meta" color="tertiary">{e.brand ? `${e.brand} · ` : ""}{e.quantity} {e.servingUnit} · P {Math.round(e.protein)} C {Math.round(e.carbs)} F {Math.round(e.fat)}</Text>
                  </View>
                  <Num size={15} color="secondary">{Math.round(e.calories)}</Num>
                </Pressable>
              ))}
              {entries.length ? <Text variant="meta" color="tertiary" style={{ marginTop: 4 }}>{Math.round(total)} kcal · long-press an entry to remove</Text> : null}
            </Card>
          </View>
        );
      })}

      <AddFood meal={meal} date={date} onClose={() => setMeal(null)} onLogged={() => { day.refetch(); setMeal(null); }} />
      <GoalSheet visible={goalOpen} onClose={() => setGoalOpen(false)} onSaved={() => { day.refetch(); setGoalOpen(false); }} initial={goal} />
    </Screen>
  );
}

function GoalSheet({ visible, onClose, onSaved, initial }: { visible: boolean; onClose: () => void; onSaved: () => void; initial?: { dailyCalories: number | null; proteinGrams: number | null; carbGrams: number | null; fatGrams: number | null } | null }) {
  const [cal, setCal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  useEffect(() => {
    if (visible) {
      setCal(initial?.dailyCalories ? String(initial.dailyCalories) : "");
      setP(initial?.proteinGrams ? String(initial.proteinGrams) : "");
      setC(initial?.carbGrams ? String(initial.carbGrams) : "");
      setF(initial?.fatGrams ? String(initial.fatGrams) : "");
    }
  }, [visible, initial]);
  const n = (s: string) => (parseFloat(s) > 0 ? parseFloat(s) : undefined);
  return (
    <Sheet visible={visible} onClose={onClose} title="Daily goal">
      <Field label="calories" value={cal} onChangeText={setCal} keyboardType="number-pad" />
      <Field label="protein (g)" value={p} onChangeText={setP} keyboardType="number-pad" />
      <Field label="carbs (g)" value={c} onChangeText={setC} keyboardType="number-pad" />
      <Field label="fat (g)" value={f} onChangeText={setF} keyboardType="number-pad" />
      <Button label="Save goal" onPress={async () => { try { await api.food.setGoal({ dailyCalories: n(cal), proteinGrams: n(p), carbGrams: n(c), fatGrams: n(f) }); onSaved(); } catch (e) { Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again."); } }} />
    </Sheet>
  );
}

function AddFood({ meal, date, onClose, onLogged }: { meal: MealType | null; date: string; onClose: () => void; onLogged: () => void }) {
  const [tab, setTab] = useState<AddTab>("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentFood[]>([]);
  const [favs, setFavs] = useState<FavoriteFood[]>([]);
  const [pick, setPick] = useState<{ source: Food["source"]; sourceId: string; name: string; brand: string | null } | null>(null);
  const [qty, setQty] = useState("1");
  const [qa, setQa] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [perm, requestPerm] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!meal) return;
    setTab("search"); setQ(""); setResults([]); setPick(null); setScanned(false);
    api.food.recent(15).then(setRecent).catch(() => {});
    api.food.favorites().then(setFavs).catch(() => {});
  }, [meal]);

  useEffect(() => {
    if (!meal || tab !== "search" || q.trim().length < 2) return;
    setBusy(true);
    const t = setTimeout(() => api.food.search(q.trim()).then((r) => setResults(r.results)).catch(() => setResults([])).finally(() => setBusy(false)), 350);
    return () => clearTimeout(t);
  }, [q, tab, meal]);

  const log = useCallback(async (input: Parameters<typeof api.food.log>[0]) => {
    try { await api.food.log({ mealType: meal ?? "snack", date, ...input }); onLogged(); } catch (e) { Alert.alert("Couldn't log", e instanceof Error ? e.message : "Try again."); }
  }, [meal, date, onLogged]);

  async function onScan(code: string) {
    if (scanned) return;
    setScanned(true);
    try {
      const r = await api.food.barcode(code);
      if (r.food) setPick({ source: r.food.source, sourceId: r.food.sourceId, name: r.food.name, brand: r.food.brand });
      else { Alert.alert("Not found", "We couldn't find that barcode. Try searching instead."); setScanned(false); }
    } catch { setScanned(false); }
  }

  const row = (key: string, name: string, sub: string, onPress: () => void, uri?: string | null) => (
    <Pressable key={key} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
      {uri ? <Image source={{ uri }} style={{ width: 40, height: 40, borderRadius: 10 }} /> : null}
      <View style={{ flex: 1 }}><Text numberOfLines={1}>{name}</Text><Text variant="meta" color="tertiary" numberOfLines={1}>{sub}</Text></View>
    </Pressable>
  );

  return (
    <Sheet visible={!!meal} onClose={onClose} title={`Add to ${MEALS.find((m) => m.id === meal)?.label ?? ""}`}>
      {pick ? (
        <>
          <Text variant="heading">{pick.name}</Text>
          {pick.brand ? <Text color="tertiary">{pick.brand}</Text> : null}
          <Field label="servings" value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
          <Button label="Log it" variant="accent" onPress={() => log({ source: pick.source, sourceId: pick.sourceId, quantity: parseFloat(qty) || 1, servingUnit: "serving" })} />
          <Button label="Back" variant="ghost" onPress={() => { setPick(null); setScanned(false); }} />
        </>
      ) : (
        <>
          <Segmented value={tab} onChange={setTab} options={[{ value: "search", label: "Search" }, { value: "recent", label: "Recent" }, { value: "favorites", label: "Faves" }, { value: "quick", label: "Quick" }, { value: "scan", label: "Scan" }]} />
          {tab === "search" && (
            <>
              <Field label="search foods" value={q} onChangeText={setQ} autoCapitalize="none" />
              {busy ? <Text color="tertiary">Searching…</Text> : null}
              {results.map((r) => row(`${r.source}:${r.sourceId}`, r.name, `${r.brand ? `${r.brand} · ` : ""}${Math.round(r.caloriesPer100)} kcal / 100g · P ${Math.round(r.proteinPer100)}`, () => setPick({ source: r.source, sourceId: r.sourceId, name: r.name, brand: r.brand }), r.imageUrl))}
            </>
          )}
          {tab === "recent" && (recent.length ? recent.map((r) => row(`${r.source}:${r.sourceId}`, r.foodName, `${r.brand ? `${r.brand} · ` : ""}${Math.round(r.calories)} kcal`, () => setPick({ source: r.source, sourceId: r.sourceId, name: r.foodName, brand: r.brand }))) : <EmptyState title="Nothing recent" />)}
          {tab === "favorites" && (favs.length ? favs.map((r) => row(r.id, r.foodName, r.brand ?? "", () => setPick({ source: r.source, sourceId: r.sourceId, name: r.foodName, brand: r.brand }))) : <EmptyState title="No favorites yet" />)}
          {tab === "quick" && (
            <>
              <Field label="name" value={qa.name} onChangeText={(v) => setQa({ ...qa, name: v })} />
              <Field label="calories" value={qa.calories} onChangeText={(v) => setQa({ ...qa, calories: v })} keyboardType="number-pad" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="protein" value={qa.protein} onChangeText={(v) => setQa({ ...qa, protein: v })} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="carbs" value={qa.carbs} onChangeText={(v) => setQa({ ...qa, carbs: v })} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="fat" value={qa.fat} onChangeText={(v) => setQa({ ...qa, fat: v })} keyboardType="decimal-pad" /></View>
              </View>
              <Button label="Add" disabled={!parseFloat(qa.calories)} onPress={() => log({ quickAdd: { name: qa.name.trim() || "Quick add", calories: parseFloat(qa.calories), protein: parseFloat(qa.protein) || undefined, carbs: parseFloat(qa.carbs) || undefined, fat: parseFloat(qa.fat) || undefined } })} />
            </>
          )}
          {tab === "scan" && (
            perm?.granted ? (
              <View style={{ height: 280, borderRadius: radius.medium, overflow: "hidden" }}>
                <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }} onBarcodeScanned={({ data }) => onScan(data)} />
              </View>
            ) : (
              <>
                <Text color="secondary">Allow camera access to scan a barcode.</Text>
                <Button label="Allow camera" onPress={requestPerm} />
              </>
            )
          )}
          <Label>Food data from Open Food Facts, USDA, Nutritionix & Edamam.</Label>
        </>
      )}
    </Sheet>
  );
}
