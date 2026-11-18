import { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/api/client";
import { useAuth } from "@/auth/auth-provider";
import type { Equipment, ProfilePatch, UnitPreference } from "@/api/types";
import { DAYS, DURATIONS, ENVIRONMENTS, EXPERIENCE, GOALS, IN_TO_CM, LB_TO_KG, WEEKDAYS } from "@/lib/profile-options";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, Field } from "@/components/ui/controls";
import { Label, Text } from "@/components/ui/text";

const STEPS = ["goal", "baseline", "environment", "safety", "schedule", "basics", "ready"] as const;
type Sex = NonNullable<ProfilePatch["biologicalSex"]>;
const SEXES: { id: Sex; label: string }[] = [
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
  { id: "other", label: "Other" },
  { id: "prefer_not_to_say", label: "Prefer not to say" },
];

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Option({ active, title, hint, onPress }: { active: boolean; title: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ padding: 14, borderRadius: radius.small, borderWidth: 1, borderColor: active ? colors.pink : colors.lineSoft, backgroundColor: active ? "rgba(213,26,122,0.12)" : colors.surface, gap: 2 }}>
      <Text style={{ fontSize: 16 }}>{title}</Text>
      {hint ? <Text variant="meta" color="tertiary" style={{ fontSize: 13 }}>{hint}</Text> : null}
    </Pressable>
  );
}

export default function Onboarding() {
  useTheme();
  const router = useRouter();
  const { refreshUser, user } = useAuth();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [goal, setGoal] = useState<ProfilePatch["fitnessGoal"] | null>(null);
  const [experience, setExperience] = useState<ProfilePatch["experienceLevel"] | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [sessionMin, setSessionMin] = useState<number | null>(45);
  const [units, setUnits] = useState<UnitPreference>("imperial");
  const [location, setLocation] = useState<ProfilePatch["trainingLocation"] | null>(null);
  const [equipmentAll, setEquipmentAll] = useState<Equipment[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [injuries, setInjuries] = useState("");
  const [preferred, setPreferred] = useState<number[]>([]);
  const [bodyweight, setBodyweight] = useState("");
  const [h1, setH1] = useState("");
  const [h2, setH2] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [sex, setSex] = useState<Sex | null>(null);

  useEffect(() => {
    api.me.equipment().then((l) => setEquipmentAll(l)).catch(() => {});
  }, []);

  const nextDay = useMemo(() => {
    if (!preferred.length) return "your next session";
    const dow = new Date().getDay();
    const sorted = [...preferred].sort((a, b) => a - b);
    const n = sorted.find((d) => d > dow) ?? sorted[0];
    return n === (dow + 1) % 7 ? "tomorrow" : WEEKDAYS[n];
  }, [preferred]);

  const canNext =
    (step === 0 && goal) || (step === 1 && experience && days && sessionMin) || (step === 2 && location) || step === 3 || (step === 4 && preferred.length > 0) || step === 5 || step === 6;

  async function finish() {
    const imperial = units === "imperial";
    const bw = parseFloat(bodyweight);
    const weightKg = Number.isFinite(bw) && bw > 0 ? Math.round((imperial ? bw * LB_TO_KG : bw) * 10) / 10 : undefined;
    let heightCm: number | undefined;
    if (imperial) {
      const ft = parseFloat(h1);
      const inch = parseFloat(h2) || 0;
      if (Number.isFinite(ft) && ft > 0) heightCm = Math.round((ft * 12 + inch) * IN_TO_CM);
    } else {
      const cm = parseFloat(h1);
      if (Number.isFinite(cm) && cm > 0) heightCm = Math.round(cm);
    }
    const yr = parseInt(birthYear, 10);
    const dateOfBirth = Number.isFinite(yr) && yr >= 1900 && yr <= new Date().getFullYear() ? `${yr}-01-01` : undefined;

    setSubmitting(true);
    setError(null);
    try {
      await api.me.onboarding({
        fitnessGoal: goal ?? undefined,
        experienceLevel: experience ?? undefined,
        trainingLocation: location ?? undefined,
        unitPreference: units,
        trainingFrequencyTarget: days ?? undefined,
        sessionLengthTargetMin: sessionMin ?? undefined,
        equipmentKeys: equipment.length ? equipment : undefined,
        injuries: injuries.trim() ? [{ tag: injuries.trim() }] : undefined,
        weightKg,
        heightCm,
        dateOfBirth,
        biologicalSex: sex ?? undefined,
      });
      await refreshUser();
      router.replace("/dashboard");
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : "Couldn't save your setup. Try again.");
    }
  }

  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : void finish());
  const input = { height: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 } as const;
  const wrap = { flexDirection: "row", flexWrap: "wrap", gap: 8 } as const;

  return (
    <Screen>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <View style={{ height: 4, width: i < step ? "100%" : i === step ? "45%" : "0%", backgroundColor: colors.pink }} />
          </View>
        ))}
      </View>
      <Label style={{ marginBottom: 18 }}>STEP {step + 1} OF {STEPS.length} · {STEPS[step].toUpperCase()}</Label>

      <View style={{ gap: 14, minHeight: 360 }}>
        {step === 0 && (
          <>
            <Text variant="title">What's your primary goal?</Text>
            <Text color="secondary">Pick one — it shapes your program.</Text>
            <View style={{ gap: 10 }}>{GOALS.map((g) => <Option key={g.id} title={g.label} active={goal === g.id} onPress={() => setGoal(g.id)} />)}</View>
          </>
        )}
        {step === 1 && (
          <>
            <Text variant="title">Your training baseline</Text>
            <Label>EXPERIENCE</Label>
            <View style={{ gap: 10 }}>{EXPERIENCE.map((e) => <Option key={e.id} title={e.label} hint={e.hint} active={experience === e.id} onPress={() => setExperience(e.id)} />)}</View>
            <Label>TRAINING DAYS PER WEEK</Label>
            <View style={wrap}>{DAYS.map((d) => <Chip key={d} label={String(d)} active={days === d} onPress={() => setDays(d)} />)}</View>
            <Label>SESSION LENGTH</Label>
            <View style={wrap}>{DURATIONS.map((d) => <Chip key={d} label={`${d} min`} active={sessionMin === d} onPress={() => setSessionMin(d)} />)}</View>
            <Label>UNITS</Label>
            <View style={wrap}>
              <Chip label="lb" active={units === "imperial"} onPress={() => setUnits("imperial")} />
              <Chip label="kg" active={units === "metric"} onPress={() => setUnits("metric")} />
            </View>
          </>
        )}
        {step === 2 && (
          <>
            <Text variant="title">Where do you train?</Text>
            <Text color="secondary">This picks which exercises you'll see.</Text>
            <View style={wrap}>{ENVIRONMENTS.map((e) => <Chip key={e.id} label={e.label} active={location === e.id} onPress={() => setLocation(e.id)} />)}</View>
            <Label>AVAILABLE EQUIPMENT</Label>
            <View style={wrap}>{equipmentAll.map((eq) => <Chip key={eq.key} label={eq.name} active={equipment.includes(eq.key)} onPress={() => setEquipment(toggle(equipment, eq.key))} />)}</View>
          </>
        )}
        {step === 3 && (
          <>
            <Text variant="title">Anything to work around?</Text>
            <Text color="secondary">Injuries, limitations, or lifts to avoid. Optional — skip if nothing applies.</Text>
            <TextInput value={injuries} onChangeText={setInjuries} multiline placeholder="e.g. left shoulder — no heavy overhead pressing" placeholderTextColor={colors.textTertiary} style={[input, { minHeight: 110, paddingTop: 14, textAlignVertical: "top" }]} />
          </>
        )}
        {step === 4 && (
          <>
            <Text variant="title">Which days work best?</Text>
            <Text color="secondary">Pick the days you'd like to train.</Text>
            <View style={wrap}>{WEEKDAYS.map((d, i) => <Chip key={d} label={d} active={preferred.includes(i)} onPress={() => setPreferred(toggle(preferred, i))} />)}</View>
          </>
        )}
        {step === 5 && (
          <>
            <Text variant="title">A few basics</Text>
            <Text color="secondary">Optional — helps Forma size your loads and calories.</Text>
            <Field label={`bodyweight (${units === "imperial" ? "lb" : "kg"})`} value={bodyweight} onChangeText={setBodyweight} keyboardType="decimal-pad" />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}><Field label={units === "imperial" ? "height (ft)" : "height (cm)"} value={h1} onChangeText={setH1} keyboardType="decimal-pad" /></View>
              {units === "imperial" ? <View style={{ flex: 1 }}><Field label="inches" value={h2} onChangeText={setH2} keyboardType="decimal-pad" /></View> : null}
            </View>
            <Field label="birth year" value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} />
            <Label>SEX</Label>
            <View style={wrap}>{SEXES.map((s) => <Chip key={s.id} label={s.label} active={sex === s.id} onPress={() => setSex(s.id)} />)}</View>
          </>
        )}
        {step === 6 && (
          <>
            <Text variant="title">You're set{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</Text>
            <Text color="secondary">Forma will build your first plan around {goal ? GOALS.find((g) => g.id === goal)?.label.toLowerCase() : "your goal"}. Your next session is {nextDay}.</Text>
            {error ? <Text variant="meta" color="danger">{error}</Text> : null}
          </>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
        {step > 0 ? <View style={{ flex: 1 }}><Button label="Back" variant="ghost" onPress={() => setStep(step - 1)} /></View> : null}
        <View style={{ flex: 2 }}>
          <Button label={step === STEPS.length - 1 ? "Start training" : step === 3 || step === 5 ? "Continue" : "Next"} loading={submitting} disabled={!canNext} onPress={next} />
        </View>
      </View>
    </Screen>
  );
}
