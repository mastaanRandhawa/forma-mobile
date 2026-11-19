/**
 * Add food (website: components/nutrition/AddFoodSheet.tsx).
 *
 * Tabs: search (USDA + fallbacks), scan (camera barcode → lookup; when a code
 * misses every database, photograph the label for OCR or add it manually),
 * recent, favorites, and manual entry (quick-add or save a reusable custom
 * food). Picking a food opens the serving screen with a live nutrition preview.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "@/api/client";
import { errorMessage } from "@/api/hooks";
import type { FavoriteFood, Food, FoodDay, FoodSearchResult, FoodSource, MealType, RecentFood } from "@/api/types";
import { MEALS, MEAL_LABEL, macroMeta, previewNutrition, round, sourceLabel } from "@/lib/food";
import { colors, fonts, radius } from "@/theme/tokens";
import { Button, Chip } from "../ui/controls";
import { EmptyState, PillTabs, Sheet, Stepper, Toggle } from "../ui/extra";
import { toast } from "../ui/toast";
import { Label, Num, Text } from "../ui/text";

type Tab = "search" | "scan" | "recent" | "favorites" | "manual";
type Unit = "serving" | "g" | "oz";
interface Picked {
  source: FoodSource;
  sourceId: string;
  name: string;
  preloaded?: Food;
  quantity?: number;
  servingUnit?: Unit;
  note?: string;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const mealOptions = MEALS.map((m) => ({ value: m, label: cap(MEAL_LABEL[m]) }));

export function AddFoodSheet({ open, meal, date, initialTab = "search", onClose, onLogged }: { open: boolean; meal: MealType; date: string; initialTab?: Tab; onClose: () => void; onLogged: (d: FoodDay) => void }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setPicked(null);
      setPhoto(null);
      setTab(initialTab);
    }
  }, [open, initialTab]);
  return (
    <Sheet visible={open} onClose={onClose} title={picked ? picked.name : "Add food"} eyebrow={picked ? "serving & meal" : MEAL_LABEL[meal]}>
      {picked ? (
        <>
          <Pressable onPress={() => setPicked(null)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
            <Text variant="meta" color="secondary">Back to {tab}</Text>
          </Pressable>
          <FoodDetail picked={picked} meal={meal} date={date} onLogged={onLogged} />
        </>
      ) : (
        <>
          <PillTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "search", label: "Search" },
              { value: "scan", label: "Scan" },
              { value: "recent", label: "Recent" },
              { value: "favorites", label: "Favorites" },
              { value: "manual", label: "Add manually" },
            ]}
          />
          {tab === "search" ? <SearchTab onPick={setPicked} /> : null}
          {tab === "scan" ? <ScanTab onPick={setPicked} onManual={() => setTab("search")} onCustom={() => setTab("manual")} onPhoto={(uri) => { setPhoto(uri); setTab("manual"); }} /> : null}
          {tab === "recent" ? <RecentTab onPick={setPicked} /> : null}
          {tab === "favorites" ? <FavoritesTab onPick={setPicked} /> : null}
          {tab === "manual" ? <ManualTab meal={meal} date={date} photo={photo} onClearPhoto={() => setPhoto(null)} onLogged={onLogged} onPickCustom={setPicked} /> : null}
        </>
      )}
    </Sheet>
  );
}

function FoodRow({ title, sub, onPress, right }: { title: string; sub: string; onPress: () => void; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, opacity: pressed ? 0.6 : 1 })}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1}>{title}</Text>
          <Text variant="meta" color="tertiary" numberOfLines={1}>{sub}</Text>
        </View>
        <Ionicons name="add-circle-outline" size={20} color={colors.textSecondary} />
      </Pressable>
      {right}
    </View>
  );
}

function SearchTab({ onPick }: { onPick: (p: Picked) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoodSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);
  const req = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    const id = ++req.current;
    setLoading(true);
    const t = setTimeout(() => {
      api.food
        .search(term)
        .then((r) => {
          if (id !== req.current) return;
          setResults(r.results);
          setDegraded(r.degraded);
          setErr(null);
        })
        .catch((e) => id === req.current && setErr(errorMessage(e as Error)))
        .finally(() => id === req.current && setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: radius.small, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
        <Ionicons name="search" size={17} color={colors.textTertiary} />
        <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Chicken breast, banana, greek yogurt…" placeholderTextColor={colors.textTertiary} autoCorrect={false} returnKeyType="search" style={{ flex: 1, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 }} />
        {loading ? <ActivityIndicator size="small" color={colors.pinkSoft} /> : q ? <Pressable onPress={() => setQ("")} hitSlop={10}><Ionicons name="close-circle" size={18} color={colors.textTertiary} /></Pressable> : null}
      </View>
      {q.trim().length < 2 ? <Text variant="meta" color="tertiary">Type at least 2 characters. Generic foods come from USDA.</Text> : null}
      {err ? <Text color="danger">{err}</Text> : null}
      {degraded ? <Text variant="meta" style={{ color: colors.amber }}>A food source was unavailable — showing what we could reach.</Text> : null}
      {!loading && !err && results?.length === 0 ? <EmptyState title="No matches" body="Try a simpler term, or create a custom food under Add manually." /> : null}
      {results?.map((r) => <FoodRow key={`${r.source}:${r.sourceId}`} title={r.brand ? `${r.name} · ${r.brand}` : r.name} sub={`${sourceLabel(r.source)} · ${macroMeta(r.caloriesPer100, r.proteinPer100, r.dataPer, r.perServingOnly)}`} onPress={() => onPick({ source: r.source, sourceId: r.sourceId, name: r.name })} />)}
    </>
  );
}

function ScanTab({ onPick, onManual, onCustom, onPhoto }: { onPick: (p: Picked) => void; onManual: () => void; onCustom: () => void; onPhoto: (uri: string) => void }) {
  const [perm, requestPerm] = useCameraPermissions();
  const [code, setCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "looking" | "parsing" | "not-found" | "unavailable" | "label-failed">("idle");
  const lock = useRef(false);

  const lookup = async (raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (clean.length < 8 || lock.current) return;
    lock.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCode(clean);
    setState("looking");
    const r = await api.food.barcode(clean).catch(() => null);
    if (r?.food) {
      onPick({ source: r.food.source, sourceId: r.food.sourceId, name: r.food.name, preloaded: r.food });
      return;
    }
    setState(r?.status === "source_unavailable" || !r ? "unavailable" : "not-found");
    lock.current = false;
  };

  const photographLabel = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted && Platform.OS !== "web") return toast.error("Camera access is needed to photograph the label.");
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, allowsEditing: false });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    const dataUrl = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
    if (!code) return onPhoto(asset.uri);
    setState("parsing");
    const r = await api.food.barcode(code, dataUrl).catch(() => null);
    if (r?.food) {
      const low = (r.confidence ?? 0) < 0.75;
      onPick({
        source: r.food.source,
        sourceId: r.food.sourceId,
        name: r.food.name,
        preloaded: r.food,
        note: r.status === "parsed_from_label" ? (low ? "Read from your label photo — some numbers may be off. Double-check them before logging." : "Read from your label photo. Give the numbers a quick check.") : undefined,
      });
      return;
    }
    setState("label-failed");
  };

  const missed = state === "not-found" || state === "unavailable" || state === "label-failed";
  return (
    <>
      {perm?.granted ? (
        <View style={{ height: 240, borderRadius: radius.medium, overflow: "hidden", backgroundColor: "#000" }}>
          <CameraView style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }} onBarcodeScanned={state === "idle" || missed ? ({ data }) => void lookup(data) : undefined} />
          <View pointerEvents="none" style={{ position: "absolute", left: "12%", right: "12%", top: "38%", height: "24%", borderWidth: 2, borderColor: "rgba(255,255,255,0.8)", borderRadius: 14 }} />
          <Text variant="meta" style={{ position: "absolute", bottom: 10, alignSelf: "center", color: "#fff" }}>Line the barcode up inside the frame</Text>
        </View>
      ) : (
        <View style={{ padding: 18, borderRadius: radius.medium, backgroundColor: colors.surface, gap: 10, alignItems: "center" }}>
          <Ionicons name="barcode-outline" size={30} color={colors.textSecondary} />
          <Text color="secondary" style={{ textAlign: "center" }}>{perm && !perm.canAskAgain ? "Camera access is turned off for Forma. Enable it in Settings to scan barcodes." : "Allow camera access to scan a barcode. Forma only uses the camera while this screen is open."}</Text>
          {perm && !perm.canAskAgain ? <Button label="Open Settings" variant="ghost" onPress={() => Linking.openSettings()} style={{ alignSelf: "stretch" }} /> : <Button label="Allow camera" onPress={requestPerm} style={{ alignSelf: "stretch" }} />}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput value={typed} onChangeText={setTyped} keyboardType="number-pad" placeholder="Or type the barcode number" placeholderTextColor={colors.textTertiary} returnKeyType="search" onSubmitEditing={() => void lookup(typed)} style={{ flex: 1, height: 46, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.num, fontSize: 15 }} />
        <Chip label="Look up" active={typed.replace(/\D/g, "").length >= 8} onPress={() => void lookup(typed)} />
      </View>
      {state === "looking" ? <Text color="tertiary">Looking up {code}…</Text> : null}
      {state === "parsing" ? <Text color="tertiary">Reading the nutrition label…</Text> : null}
      {missed ? (
        <View style={{ padding: 14, borderRadius: radius.medium, backgroundColor: "rgba(255,156,99,0.10)", gap: 8 }}>
          <Text style={{ fontFamily: fonts.semibold }}>{state === "unavailable" ? "Food databases are unreachable right now" : state === "label-failed" ? "Couldn't read that label clearly" : "Not found in any food database"}</Text>
          <Text variant="meta" color="secondary">{code ? `Barcode ${code}. ` : ""}{state === "label-failed" ? "Try another photo — fill the frame with the nutrition facts panel — or add it manually." : "Photograph the nutrition facts label, or add it another way."}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label="Photograph label" active onPress={photographLabel} />
            <Chip label="Search manually" onPress={onManual} />
            <Chip label="Create custom food" onPress={onCustom} />
          </View>
        </View>
      ) : null}
    </>
  );
}

function RecentTab({ onPick }: { onPick: (p: Picked) => void }) {
  const [items, setItems] = useState<RecentFood[] | null>(null);
  useEffect(() => {
    api.food.recent(25).then(setItems).catch(() => setItems([]));
  }, []);
  if (!items) return <ActivityIndicator color={colors.pinkSoft} style={{ marginVertical: 20 }} />;
  if (!items.length) return <EmptyState title="Nothing logged yet" body="Foods you log show up here for one-tap re-logging." />;
  return (
    <>
      {items.map((r) => (
        <FoodRow key={`${r.source}:${r.sourceId}`} title={r.brand ? `${r.foodName} · ${r.brand}` : r.foodName} sub={`Last: ${round(r.lastQuantity, 2)} ${r.lastServingUnit} · ${Math.round(r.calories)} kcal`} onPress={() => onPick({ source: r.source, sourceId: r.sourceId, name: r.foodName, quantity: r.lastQuantity, servingUnit: r.lastServingUnit as Unit })} />
      ))}
    </>
  );
}

function FavoritesTab({ onPick }: { onPick: (p: Picked) => void }) {
  const [items, setItems] = useState<FavoriteFood[] | null>(null);
  const reload = () => api.food.favorites().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    void reload();
  }, []);
  if (!items) return <ActivityIndicator color={colors.pinkSoft} style={{ marginVertical: 20 }} />;
  if (!items.length) return <EmptyState title="No favorites yet" body="Star a food on its serving screen to keep it here." />;
  return (
    <>
      {items.map((f) => (
        <FoodRow
          key={f.id}
          title={f.brand ? `${f.foodName} · ${f.brand}` : f.foodName}
          sub={sourceLabel(f.source)}
          onPress={() => onPick({ source: f.source, sourceId: f.sourceId, name: f.foodName })}
          right={
            <Pressable
              accessibilityLabel={`Remove ${f.foodName} from favorites`}
              hitSlop={8}
              onPress={async () => {
                setItems((cur) => cur?.filter((x) => x.id !== f.id) ?? null);
                await api.food.removeFavorite(f.id).catch(() => void reload());
              }}
            >
              <Ionicons name="star" size={18} color={colors.amber} />
            </Pressable>
          }
        />
      ))}
    </>
  );
}

function NumField({ label, value, onChange, flex = 1 }: { label: string; value: string; onChange: (v: string) => void; flex?: number }) {
  return (
    <View style={{ flex, gap: 4 }}>
      <Label>{label.toUpperCase()}</Label>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholderTextColor={colors.textTertiary} style={{ height: 44, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 12, color: colors.textPrimary, fontFamily: fonts.num, fontSize: 15 }} />
    </View>
  );
}

function ManualTab({ meal, date, photo, onClearPhoto, onLogged, onPickCustom }: { meal: MealType; date: string; photo: string | null; onClearPhoto: () => void; onLogged: (d: FoodDay) => void; onPickCustom: (p: Picked) => void }) {
  const [mine, setMine] = useState<Food[] | null>(null);
  const reload = () => api.food.customs().then(setMine).catch(() => setMine([]));
  useEffect(() => {
    void reload();
  }, []);
  const [f, setF] = useState({ name: "", brand: "", servingSize: "1", servingUnit: "serving", servingGrams: "", basis: "serving" as "serving" | "100g", calories: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "", sodium: "" });
  const [m, setM] = useState<MealType>(meal);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const num = (s: string) => {
    const n = Number.parseFloat(s.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const submit = async () => {
    setErr(null);
    const calories = num(f.calories);
    if (calories == null) return setErr("Calories are required and can't be negative.");
    for (const [k, v] of Object.entries({ protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, sugar: f.sugar, sodium: f.sodium })) if (v.trim() && num(v) == null) return setErr(`${cap(k)} can't be negative.`);
    setBusy(true);
    try {
      if (save) {
        if (!f.name.trim()) throw new Error("A saved food needs a name.");
        const servingSize = num(f.servingSize);
        if (!servingSize) throw new Error("Serving size must be greater than 0.");
        const created = await api.food.createCustom({ name: f.name.trim(), brand: f.brand.trim() || undefined, servingSize, servingUnit: f.servingUnit.trim() || "serving", servingGrams: num(f.servingGrams), basis: f.basis, calories, protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat), fiber: num(f.fiber), sugar: num(f.sugar), sodium: num(f.sodium) });
        const r = await api.food.log({ source: "custom", sourceId: created.sourceId, mealType: m, quantity: 1, servingUnit: "serving", date });
        toast.success(`${created.name} saved & logged`);
        onLogged(r.day);
      } else {
        const r = await api.food.log({ quickAdd: { name: f.name.trim() || undefined, calories, protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat) }, mealType: m, date });
        toast.success(`${Math.round(calories)} kcal added to ${MEAL_LABEL[m]}`);
        onLogged(r.day);
      }
    } catch (e) {
      setErr(errorMessage(e as Error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {photo ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.small, backgroundColor: colors.surface }}>
          <Ionicons name="image-outline" size={18} color={colors.textSecondary} />
          <Text variant="meta" color="secondary" style={{ flex: 1 }}>Label photo attached as a reference while you fill this in. It isn't uploaded or stored.</Text>
          <Pressable onPress={onClearPhoto} hitSlop={8} accessibilityLabel="Remove photo"><Ionicons name="trash-outline" size={16} color={colors.textTertiary} /></Pressable>
        </View>
      ) : null}
      {mine && mine.length ? (
        <View style={{ gap: 2 }}>
          <Label>YOUR FOODS</Label>
          {mine.map((food) => (
            <FoodRow
              key={food.id}
              title={food.brand ? `${food.name} · ${food.brand}` : food.name}
              sub={`${Math.round(food.caloriesPer100)} kcal ${food.perServingOnly ? "per serving" : "per 100 g"}`}
              onPress={() => onPickCustom({ source: "custom", sourceId: food.sourceId, name: food.name, preloaded: food })}
              right={
                <Pressable
                  hitSlop={8}
                  accessibilityLabel={`Delete ${food.name}`}
                  onPress={async () => {
                    setMine((cur) => cur?.filter((x) => x.id !== food.id) ?? null);
                    await api.food.deleteCustom(food.sourceId).catch(() => void reload());
                  }}
                >
                  <Ionicons name="remove-circle-outline" size={20} color={colors.textTertiary} />
                </Pressable>
              }
            />
          ))}
        </View>
      ) : null}
      <Text variant="meta" color="tertiary">Add anything search and barcode can't find. Calories are required; macros optional.</Text>
      <View style={{ gap: 4 }}>
        <Label>NAME{save ? " *" : " · OPTIONAL"}</Label>
        <TextInput value={f.name} onChangeText={set("name")} placeholder="e.g. grandma's banana bread" placeholderTextColor={colors.textTertiary} style={{ height: 46, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 }} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <NumField label="kcal *" value={f.calories} onChange={set("calories")} />
        <NumField label="protein" value={f.protein} onChange={set("protein")} />
        <NumField label="carbs" value={f.carbs} onChange={set("carbs")} />
        <NumField label="fat" value={f.fat} onChange={set("fat")} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Toggle value={save} onChange={setSave} />
        <Text style={{ flex: 1 }}>Save to my foods (reusable, with a serving size)</Text>
      </View>
      {save ? (
        <>
          <View style={{ gap: 4 }}>
            <Label>BRAND · OPTIONAL</Label>
            <TextInput value={f.brand} onChangeText={set("brand")} style={{ height: 44, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 15 }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <NumField label="serving size *" value={f.servingSize} onChange={set("servingSize")} />
            <View style={{ flex: 1, gap: 4 }}>
              <Label>UNIT *</Label>
              <TextInput value={f.servingUnit} onChangeText={set("servingUnit")} placeholder="slice, cup…" placeholderTextColor={colors.textTertiary} style={{ height: 44, borderRadius: radius.small, backgroundColor: colors.surfaceRecessed, paddingHorizontal: 12, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 15 }} />
            </View>
            <NumField label="grams" value={f.servingGrams} onChange={set("servingGrams")} />
          </View>
          <Label>VALUES ABOVE ARE PER</Label>
          <PillTabs value={f.basis} onChange={(v) => setF((s) => ({ ...s, basis: v }))} options={[{ value: "serving", label: "Serving" }, { value: "100g", label: "100 g" }]} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <NumField label="fiber g" value={f.fiber} onChange={set("fiber")} />
            <NumField label="sugar g" value={f.sugar} onChange={set("sugar")} />
            <NumField label="sodium mg" value={f.sodium} onChange={set("sodium")} />
          </View>
        </>
      ) : null}
      <Label>MEAL</Label>
      <PillTabs value={m} onChange={setM} options={mealOptions} />
      {err ? <Text color="danger">{err}</Text> : null}
      <Button label={save ? "Save & log" : `Add to ${MEAL_LABEL[m]}`} variant="accent" loading={busy} disabled={num(f.calories) == null} onPress={submit} />
    </>
  );
}

function FoodDetail({ picked, meal, date, onLogged }: { picked: Picked; meal: MealType; date: string; onLogged: (d: FoodDay) => void }) {
  const [food, setFood] = useState<Food | null>(picked.preloaded ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [qty, setQty] = useState<number | null>(picked.quantity ?? 1);
  const [unit, setUnit] = useState<Unit>(picked.servingUnit ?? "serving");
  const [m, setM] = useState<MealType>(meal);
  const [busy, setBusy] = useState(false);
  const [fav, setFav] = useState<FavoriteFood | null>(null);
  useEffect(() => {
    if (picked.preloaded) setFood(picked.preloaded);
    else api.food.item(picked.source, picked.sourceId).then(setFood).catch((e) => setErr(errorMessage(e as Error)));
    api.food.favorites().then((l) => setFav(l.find((x) => x.source === picked.source && x.sourceId === picked.sourceId) ?? null)).catch(() => {});
  }, [picked]);
  // pick a sensible starting unit once the food is known
  const unitInit = useRef(false);
  useEffect(() => {
    if (!food || unitInit.current) return;
    unitInit.current = true;
    if (food.perServingOnly) setUnit("serving");
    else if (!food.servingGrams && !picked.servingUnit) {
      setUnit("g");
      setQty(100);
    }
  }, [food, picked.servingUnit]);

  if (err) return <Text color="danger">{err}</Text>;
  if (!food) return <ActivityIndicator color={colors.pinkSoft} style={{ marginVertical: 30 }} />;
  const quantity = qty ?? 0;
  const prev = previewNutrition(food, quantity, unit);
  const units: Unit[] = food.perServingOnly ? ["serving"] : food.servingGrams ? ["serving", "g", "oz"] : ["g", "oz"];
  const toggleFav = async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      if (fav) {
        await api.food.removeFavorite(fav.id);
        setFav(null);
      } else setFav(await api.food.addFavorite(food.source, food.sourceId));
    } catch (e) {
      toast.error(errorMessage(e as Error));
    }
  };
  const log = async () => {
    if (!quantity) return;
    setBusy(true);
    try {
      const r = await api.food.log({ source: food.source, sourceId: food.sourceId, quantity, servingUnit: unit, mealType: m, date });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast.success(`${food.name} added to ${MEAL_LABEL[m]}`);
      onLogged(r.day);
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1 }}>
          {food.brand ? <Text color="secondary">{food.brand}</Text> : null}
          <Text variant="meta" color="tertiary">{sourceLabel(food.source)}{food.servingSize && food.servingUnit ? ` · 1 serving = ${round(food.servingSize, 2)} ${food.servingUnit}${food.servingGrams ? ` (${Math.round(food.servingGrams)} g)` : ""}` : ""}</Text>
        </View>
        <Pressable onPress={toggleFav} hitSlop={10} accessibilityLabel={fav ? "Remove from favorites" : "Add to favorites"}>
          <Ionicons name={fav ? "star" : "star-outline"} size={24} color={fav ? colors.amber : colors.textSecondary} />
        </Pressable>
      </View>
      {picked.note ? <View style={{ padding: 10, borderRadius: radius.small, backgroundColor: "rgba(255,182,97,0.12)" }}><Text variant="meta" style={{ color: colors.amber }}>{picked.note}</Text></View> : null}
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
        <Stepper label="amount" value={qty} step={unit === "serving" ? 0.5 : unit === "g" ? 10 : 1} min={0} max={5000} onChange={setQty} />
      </View>
      <PillTabs value={unit} onChange={setUnit} options={units.map((x) => ({ value: x, label: x === "serving" ? "Serving" : x }))} />
      <View style={{ padding: 14, borderRadius: radius.medium, backgroundColor: colors.surface, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Num size={34}>{prev.nutrients.calories}</Num>
          <Text color="tertiary">kcal{prev.grams != null ? ` · ${Math.round(prev.grams)} g` : ""}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([["Protein", prev.nutrients.protein, colors.lime], ["Carbs", prev.nutrients.carbs, colors.cyan], ["Fat", prev.nutrients.fat, colors.amber]] as const).map(([l, v, c]) => (
            <View key={l} style={{ flex: 1, gap: 2 }}>
              <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: c }} />
              <Num size={16}>{round(v)} g</Num>
              <Text variant="meta" color="tertiary">{l}</Text>
            </View>
          ))}
        </View>
        {prev.nutrients.fiber != null || prev.nutrients.sugar != null || prev.nutrients.sodium != null ? (
          <Text variant="meta" color="tertiary">{[prev.nutrients.fiber != null ? `Fiber ${prev.nutrients.fiber} g` : null, prev.nutrients.sugar != null ? `Sugar ${prev.nutrients.sugar} g` : null, prev.nutrients.sodium != null ? `Sodium ${prev.nutrients.sodium} mg` : null].filter(Boolean).join(" · ")}</Text>
        ) : null}
        {food.perServingOnly ? <Text variant="meta" color="tertiary">This food only lists nutrition per serving.</Text> : !food.servingGrams ? <Text variant="meta" color="tertiary">No serving size on file — log it by weight.</Text> : null}
      </View>
      <Label>MEAL</Label>
      <PillTabs value={m} onChange={setM} options={mealOptions} />
      <Button label={`Add to ${MEAL_LABEL[m]}`} variant="accent" loading={busy} disabled={!quantity} onPress={log} />
    </>
  );
}
