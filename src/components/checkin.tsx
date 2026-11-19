/**
 * Daily recovery check-in (website: components/health/DailyCheckin.tsx).
 * A card for Home/Progress, the slider sheet, and `useCheckinGate` — which
 * honours the "prompt me before my first workout" preference by asking for a
 * check-in before the day's first session starts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useResource } from "@/api/hooks";
import { usePrefs } from "@/api/settings";
import type { ReadinessBreakdown, RecoveryCheckin } from "@/api/types";
import { colors } from "@/theme/tokens";
import { Button, Chip } from "./ui/controls";
import { Sheet, SliderBar } from "./ui/extra";
import { SoftSurface } from "./ui/surface";
import { toast } from "./ui/toast";
import { Label, Num, Text } from "./ui/text";

const isToday = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString();

export function useCheckins() {
  return useResource<RecoveryCheckin[]>("checkins", () => api.progress.checkins());
}

export function useTodayCheckin() {
  const list = useCheckins();
  const latest = [...(list.data ?? [])].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0] ?? null;
  return { latest, done: isToday(latest?.recordedAt), loading: list.initialLoading, refetch: list.refetch };
}

function Row({ label, value, suffix = "", children }: { label: string; value: number; suffix?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4, paddingVertical: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text>{label}</Text>
        <Num size={15} color="secondary">{value}{suffix}</Num>
      </View>
      {children}
    </View>
  );
}

export function CheckinSheet({ visible, onClose, onSaved, seed, primaryLabel = "Complete check-in", onSkip }: { visible: boolean; onClose: () => void; onSaved?: (r: ReadinessBreakdown) => void; seed?: RecoveryCheckin | null; primaryLabel?: string; onSkip?: () => void }) {
  const [sleepH, setSleepH] = useState(7);
  const [sleepQuality, setSQ] = useState(3);
  const [fatigue, setF] = useState(3);
  const [soreness, setS] = useState(3);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const s = seed && isToday(seed.recordedAt) ? seed : null;
    setSleepH(s?.sleepH ?? 7);
    setSQ(s?.sleepQuality ?? 3);
    setF(s?.fatigue ?? 3);
    setS(s?.soreness ?? 3);
  }, [visible, seed]);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.progress.checkin({ sleepH, sleepQuality, fatigue, soreness });
      invalidateResource("checkins");
      invalidateResource("readiness");
      invalidateResource("dashboard");
      toast.success(`Readiness ${r.readiness.score}`);
      onSaved?.(r.readiness);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="How are you feeling?"
      eyebrow="Daily check-in"
      footer={
        <>
          <Button label={primaryLabel} variant="accent" loading={busy} onPress={save} />
          {onSkip ? <Button label="Skip for today" variant="ghost" onPress={onSkip} /> : null}
        </>
      }
    >
      <Text color="secondary">A quick read on sleep and recovery. Forma uses it to set today's training intensity.</Text>
      <Row label="Hours slept" value={sleepH} suffix="h"><SliderBar value={sleepH} min={3} max={11} step={0.5} onChange={setSleepH} tone="cyan" accessibilityLabel="Hours slept" /></Row>
      <Row label="Sleep quality" value={sleepQuality} suffix="/5"><SliderBar value={sleepQuality} min={1} max={5} step={1} onChange={setSQ} tone="cyan" accessibilityLabel="Sleep quality" /></Row>
      <Row label="Fatigue" value={fatigue} suffix="/5"><SliderBar value={fatigue} min={1} max={5} step={1} onChange={setF} tone="amber" accessibilityLabel="Fatigue" /></Row>
      <Row label="Muscle soreness" value={soreness} suffix="/5"><SliderBar value={soreness} min={1} max={5} step={1} onChange={setS} tone="amber" accessibilityLabel="Muscle soreness" /></Row>
    </Sheet>
  );
}

/** Home entry point — prompts when today's check-in is missing, otherwise shows the result. */
export function CheckinCard({ readiness, onSaved }: { readiness?: number | null; onSaved?: () => void }) {
  const today = useTodayCheckin();
  const [open, setOpen] = useState(false);
  return (
    <SoftSurface style={{ padding: 16 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(131,233,244,0.16)" }}>
          <Ionicons name="moon-outline" size={17} color={colors.cyan} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Label>DAILY CHECK-IN</Label>
          {today.done ? (
            <Text color="secondary">Readiness <Text>{readiness ?? "—"}</Text> · {today.latest?.sleepH ?? "—"}h sleep. Today's session stays at planned intensity.</Text>
          ) : (
            <Text color="secondary">How are you feeling today? A quick check-in lets Forma tune today's workout.</Text>
          )}
          <View style={{ flexDirection: "row", marginTop: 6 }}>
            <Chip label={today.done ? "Update check-in" : "Check in"} active={!today.done} onPress={() => setOpen(true)} />
          </View>
        </View>
      </View>
      <CheckinSheet visible={open} onClose={() => setOpen(false)} seed={today.latest} onSaved={() => { today.refetch(); onSaved?.(); }} />
    </SoftSurface>
  );
}

/**
 * Wrap "start workout" actions: when the preference asks for it and there's
 * no check-in today, show the sheet first; the workout starts after save/skip.
 */
export function useCheckinGate() {
  const prefs = usePrefs();
  const today = useTodayCheckin();
  const [visible, setVisible] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const gate = useCallback(
    (fn: () => void) => {
      const want = prefs.recovery.manualCheckins && prefs.recovery.promptBeforeFirstWorkout && !today.done && !today.loading;
      if (!want) return fn();
      pending.current = fn;
      setVisible(true);
    },
    [prefs.recovery, today.done, today.loading],
  );
  const run = () => {
    const fn = pending.current;
    pending.current = null;
    setVisible(false);
    if (fn) setTimeout(fn, 260);
  };
  const element = <CheckinSheet visible={visible} onClose={() => { pending.current = null; setVisible(false); }} seed={today.latest} primaryLabel="Check in & start" onSaved={() => { today.refetch(); run(); }} onSkip={run} />;
  return { gate, element };
}
