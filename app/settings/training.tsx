import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { api } from "@/api/client";
import { useAuth } from "@/auth/auth-provider";
import type { Equipment, InjuryNote, ProfilePatch } from "@/api/types";
import { DAYS, DURATIONS, ENVIRONMENTS, EXPERIENCE, GOALS, GOAL_LABELS, KG_TO_LB, LB_TO_KG } from "@/lib/profile-options";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Card, PageHeader, SettingRow, Segmented } from "@/components/ui/extra";
import { Button, Chip } from "@/components/ui/controls";
import { Label, Text } from "@/components/ui/text";
import { setDevicePrefs, useDevicePrefs } from "@/lib/device-prefs";
import { syncWorkoutReminders } from "@/lib/reminders";
import { usePrefs } from "@/api/settings";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TrainingProfile() {
  useTheme();
  const { user, setUser } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<(Equipment & { owned: boolean })[]>([]);
  const [injuries, setInjuries] = useState<InjuryNote[]>([]);
  const [injury, setInjury] = useState("");
  const [weight, setWeight] = useState("");
  const device = useDevicePrefs();
  const prefs = usePrefs();
  const toggleDay = (d: number) => {
    const next = device.preferredDays.includes(d) ? device.preferredDays.filter((x) => x !== d) : [...device.preferredDays, d].sort();
    setDevicePrefs({ preferredDays: next });
    void syncWorkoutReminders({ enabled: prefs.notifications.workoutReminders, days: next, hour: device.reminderHour, minute: device.reminderMinute });
  };

  useEffect(() => {
    api.me.equipment().then(setEquipment).catch(() => {});
    api.me.injuries().then(setInjuries).catch(() => {});
  }, []);

  if (!user) return null;
  const imperial = user.unitPreference === "imperial";

  async function save(p: ProfilePatch) {
    try {
      setUser(await api.me.update(p));
    } catch {
      /* surfaced by the unchanged value */
    }
  }
  const toggleRow = (id: string) => setOpen((o) => (o === id ? null : id));

  async function toggleEquip(key: string) {
    const next = equipment.map((e) => (e.key === key ? { ...e, owned: !e.owned } : e));
    setEquipment(next);
    await api.me.setEquipment(next.filter((e) => e.owned).map((e) => e.key)).catch(() => {});
  }

  return (
    <Screen>
      <PageHeader title="Training profile" subtitle="Edit any field directly — changes save as you make them." />
      <Card>
        <SettingRow title="Goal" hint={user.fitnessGoal ? GOAL_LABELS[user.fitnessGoal] : "Not set"} onPress={() => toggleRow("goal")} />
        {open === "goal" && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 12 }}>
            {GOALS.map((g) => <Chip key={g.id} label={g.label} active={user.fitnessGoal === g.id} onPress={() => save({ fitnessGoal: g.id })} />)}
          </View>
        )}
        <SettingRow title="Experience" hint={user.experienceLevel ?? "Not set"} onPress={() => toggleRow("exp")} />
        {open === "exp" && (
          <View style={{ gap: 8, paddingBottom: 12 }}>
            {EXPERIENCE.map((e) => (
              <Chip key={e.id} label={`${e.label} — ${e.hint}`} active={user.experienceLevel === e.id} onPress={() => save({ experienceLevel: e.id })} />
            ))}
          </View>
        )}
        <SettingRow title="Training frequency" hint={user.trainingFrequencyTarget ? `${user.trainingFrequencyTarget} days / week` : "Not set"} onPress={() => toggleRow("freq")} />
        {open === "freq" && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 12 }}>
            {DAYS.map((d) => <Chip key={d} label={`${d} days`} active={user.trainingFrequencyTarget === d} onPress={() => save({ trainingFrequencyTarget: d })} />)}
          </View>
        )}
        <SettingRow title="Preferred training days" hint={device.preferredDays.length ? device.preferredDays.map((d) => WEEKDAYS[d]).join(", ") : "Not set"} onPress={() => toggleRow("days")} />
        {open === "days" && (
          <View style={{ gap: 8, paddingBottom: 12 }}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {WEEKDAYS.map((d, i) => <View key={d} style={{ flex: 1 }}><Chip label={d.slice(0, 2)} active={device.preferredDays.includes(i)} onPress={() => toggleDay(i)} /></View>)}
            </View>
            <Text variant="meta" color="tertiary">Shown as planned days on your calendar and used for workout reminders. Saved on this device.</Text>
          </View>
        )}
        <SettingRow title="Session length" hint={user.sessionLengthTargetMin ? `${user.sessionLengthTargetMin} min` : "Not set"} onPress={() => toggleRow("len")} />
        {open === "len" && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 12 }}>
            {DURATIONS.map((d) => <Chip key={d} label={`${d} min`} active={user.sessionLengthTargetMin === d} onPress={() => save({ sessionLengthTargetMin: d })} />)}
          </View>
        )}
        <SettingRow title="Training environment" hint={ENVIRONMENTS.find((e) => e.id === user.trainingLocation)?.label ?? "Not set"} onPress={() => toggleRow("env")} />
        {open === "env" && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 12 }}>
            {ENVIRONMENTS.map((e) => <Chip key={e.id} label={e.label} active={user.trainingLocation === e.id} onPress={() => save({ trainingLocation: e.id })} />)}
          </View>
        )}
        <SettingRow title="Equipment" hint={equipment.filter((e) => e.owned).map((e) => e.name).join(", ") || "Not set"} onPress={() => toggleRow("eq")} />
        {open === "eq" && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 12 }}>
            {equipment.map((e) => <Chip key={e.key} label={e.name} active={e.owned} onPress={() => toggleEquip(e.key)} />)}
          </View>
        )}
        <SettingRow title="Injuries & limitations" hint={injuries.filter((i) => i.active).map((i) => i.tag).join(", ") || "None"} onPress={() => toggleRow("inj")} />
        {open === "inj" && (
          <View style={{ gap: 10, paddingBottom: 12 }}>
            {injuries.map((i) => (
              <Chip key={i.id} label={`${i.tag}${i.note ? ` — ${i.note}` : ""}  ✕`} active onPress={async () => { await api.me.deleteInjury(i.id).catch(() => {}); setInjuries((l) => l.filter((x) => x.id !== i.id)); }} />
            ))}
            <TextInput value={injury} onChangeText={setInjury} placeholder="e.g. left shoulder — no heavy overhead pressing" placeholderTextColor={colors.textTertiary} multiline style={{ minHeight: 70, borderRadius: 16, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 15 }} />
            <Button label="Add" variant="ghost" disabled={!injury.trim()} onPress={async () => { const n = await api.me.addInjury(injury.trim()).catch(() => null); if (n) setInjuries((l) => [...l, n]); setInjury(""); }} />
          </View>
        )}
        <SettingRow title="Units" hint={imperial ? "lb · in" : "kg · cm"} onPress={() => toggleRow("units")} />
        {open === "units" && (
          <View style={{ paddingBottom: 12 }}>
            <Segmented value={user.unitPreference} onChange={(v) => save({ unitPreference: v })} options={[{ value: "imperial", label: "lb" }, { value: "metric", label: "kg" }]} />
          </View>
        )}
        <SettingRow last title="Bodyweight" hint={user.weightKg ? `${imperial ? Math.round(user.weightKg * KG_TO_LB) : Math.round(user.weightKg * 10) / 10} ${imperial ? "lb" : "kg"}` : "Not logged"} onPress={() => toggleRow("bw")} />
        {open === "bw" && (
          <View style={{ gap: 10, paddingVertical: 8 }}>
            <Label>BODYWEIGHT ({imperial ? "LB" : "KG"})</Label>
            <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={imperial ? "175" : "80"} placeholderTextColor={colors.textTertiary} style={{ height: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 }} />
            <Button label="Save" variant="ghost" onPress={() => { const n = parseFloat(weight); if (n > 0) { void save({ weightKg: imperial ? n * LB_TO_KG : n }); setOpen(null); } }} />
          </View>
        )}
      </Card>
      <Text variant="meta" color="tertiary">Want to start over? Open Redo setup from the More tab.</Text>
    </Screen>
  );
}
