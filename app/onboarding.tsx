/**
 * Onboarding questionnaire — eight short steps. Goal, experience, schedule,
 * where you train, anything to work around, a few body basics, how you like to
 * be coached, then a recap you can edit before Forma builds your first plan.
 *
 * Everything lands in one POST /me/onboarding: the profile, equipment, structured
 * injuries (Kai asks about them by name), the coaching style and the dashboard feel.
 */
import { useEffect, useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInRight, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { api } from "@/api/client";
import { useAuth } from "@/auth/auth-provider";
import type { Equipment, ProfilePatch, UnitPreference } from "@/api/types";
import { COACH_STYLES, DAYS, DAYS_HINT, DURATIONS, ENVIRONMENTS, EXPERIENCE, GOALS, HEALTH_AREAS, IN_TO_CM, LB_TO_KG, WEEKDAYS } from "@/lib/profile-options";
import { setDevicePrefs } from "@/lib/device-prefs";
import { EASE_LUXURY } from "@/lib/ease";
import { motion } from "@/lib/motion";
import { useTheme } from "@/theme/theme-provider";
import { colors, fonts, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Button, Chip, Field } from "@/components/ui/controls";
import { PressScale } from "@/components/ui/pressable";
import { Label, Text } from "@/components/ui/text";

const STEPS = [
  { id: "goal", label: "Goal" },
  { id: "experience", label: "Experience" },
  { id: "schedule", label: "Schedule" },
  { id: "place", label: "Where you train" },
  { id: "health", label: "Health" },
  { id: "about", label: "About you" },
  { id: "coach", label: "Coaching" },
  { id: "review", label: "Review" },
] as const;
const LAST = STEPS.length - 1;
/** steps that can be skipped */
const OPTIONAL = new Set([4, 5, 6]);

type Sex = NonNullable<ProfilePatch["biologicalSex"]>;
const SEXES: { id: Sex; label: string }[] = [
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
  { id: "other", label: "Other" },
  { id: "prefer_not_to_say", label: "Prefer not to say" },
];

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const wrap = { flexDirection: "row", flexWrap: "wrap", gap: 8 } as const;

/** A tappable answer: icon, title, a line of help, and a clear selected state. */
function Choice({ icon, title, hint, active, onPress, tile }: { icon?: keyof typeof Ionicons.glyphMap; title: string; hint?: string; active: boolean; onPress: () => void; tile?: boolean }) {
  return (
    <PressScale
      onPress={onPress}
      haptic="select"
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={hint ? `${title}. ${hint}` : title}
      style={{
        flexBasis: tile ? "48%" : undefined,
        flexGrow: tile ? 1 : undefined,
        padding: 14,
        borderRadius: radius.medium,
        borderWidth: 1.5,
        borderColor: active ? colors.pink : colors.lineSoft,
        backgroundColor: active ? "rgba(213,26,122,0.12)" : colors.surface,
        flexDirection: tile ? "column" : "row",
        alignItems: tile ? "flex-start" : "center",
        gap: tile ? 10 : 14,
      }}
    >
      {icon ? (
        <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: active ? "rgba(213,26,122,0.22)" : "rgba(255,255,255,0.06)" }}>
          <Ionicons name={icon} size={19} color={active ? colors.pinkSoft : colors.textSecondary} />
        </View>
      ) : null}
      <View style={{ flex: tile ? undefined : 1, gap: 2 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 16 }}>{title}</Text>
        {hint ? <Text variant="meta" color="tertiary" style={{ fontSize: 13, lineHeight: 18 }}>{hint}</Text> : null}
      </View>
      {!tile ? <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={22} color={active ? colors.pink : colors.textTertiary} /> : null}
    </PressScale>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="title">{title}</Text>
      {sub ? <Text color="secondary">{sub}</Text> : null}
    </View>
  );
}

function ProgressBars({ step }: { step: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 5 }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}>
      {STEPS.map((s, i) => (
        <Bar key={s.id} fill={i < step ? 1 : i === step ? 0.5 : 0} />
      ))}
    </View>
  );
}

function Bar({ fill }: { fill: number }) {
  const w = useSharedValue(fill);
  useEffect(() => {
    w.set(withTiming(fill, { duration: motion.reduced ? 0 : 350, easing: EASE_LUXURY }));
  }, [fill, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
      <Animated.View style={[{ height: 4, backgroundColor: colors.pink }, style]} />
    </View>
  );
}

function Recap({ rows, onEdit }: { rows: { step: number; label: string; value: string }[]; onEdit: (step: number) => void }) {
  return (
    <View style={{ borderRadius: radius.medium, backgroundColor: colors.surface, overflow: "hidden" }}>
      {rows.map((r, i) => (
        <PressScale key={r.label} onPress={() => onEdit(r.step)} to={0.99} accessibilityLabel={`Edit ${r.label}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.lineSoft }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Label>{r.label.toUpperCase()}</Label>
            <Text numberOfLines={2}>{r.value}</Text>
          </View>
          <Text variant="meta" color="pink">Edit</Text>
        </PressScale>
      ))}
    </View>
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
  const [preferred, setPreferred] = useState<number[]>([]);
  const [mondayStart, setMondayStart] = useState(false);
  const [units, setUnits] = useState<UnitPreference>("imperial");
  const [location, setLocation] = useState<ProfilePatch["trainingLocation"] | null>(null);
  const [equipmentAll, setEquipmentAll] = useState<Equipment[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [injuryNote, setInjuryNote] = useState("");
  const [bodyweight, setBodyweight] = useState("");
  const [h1, setH1] = useState("");
  const [h2, setH2] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [sex, setSex] = useState<Sex | null>(null);
  const [coach, setCoach] = useState("steady");
  const [calm, setCalm] = useState(false);

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

  const goalInfo = GOALS.find((g) => g.id === goal);
  const canNext = [!!goal, !!experience, !!days && !!sessionMin && preferred.length > 0, !!location, true, true, true, true][step];

  const pickLocation = (id: NonNullable<typeof location>) => {
    setLocation(id);
    // a full gym has everything: save a dozen taps
    if (id === "gym" && !equipment.length) setEquipment(equipmentAll.map((e) => e.key));
  };

  const heightCm = () => {
    if (units === "imperial") {
      const ft = parseFloat(h1);
      const inch = parseFloat(h2) || 0;
      return Number.isFinite(ft) && ft > 0 ? Math.round((ft * 12 + inch) * IN_TO_CM) : undefined;
    }
    const cm = parseFloat(h1);
    return Number.isFinite(cm) && cm > 0 ? Math.round(cm) : undefined;
  };

  async function finish() {
    const bw = parseFloat(bodyweight);
    const weightKg = Number.isFinite(bw) && bw > 0 ? Math.round((units === "imperial" ? bw * LB_TO_KG : bw) * 10) / 10 : undefined;
    const yr = parseInt(birthYear, 10);
    const dateOfBirth = Number.isFinite(yr) && yr >= 1900 && yr <= new Date().getFullYear() ? `${yr}-01-01` : undefined;
    const note = injuryNote.trim();
    // areas become named injuries; a note rides on the first one. A note with no area stays a free-text entry.
    const injuries = areas.length
      ? areas.map((a, i) => ({ tag: a.toLowerCase(), ...(i === 0 && note ? { note } : {}) }))
      : note
        ? [{ tag: note }]
        : undefined;

    setSubmitting(true);
    setError(null);
    try {
      await api.me.onboarding({
        fitnessGoal: goal ?? undefined,
        experienceLevel: experience ?? undefined,
        trainingLocation: location ?? undefined,
        unitPreference: units,
        weekStartsMonday: mondayStart,
        trainingFrequencyTarget: days ?? undefined,
        sessionLengthTargetMin: sessionMin ?? undefined,
        equipmentKeys: equipment.length ? equipment : undefined,
        injuries,
        weightKg,
        heightCm: heightCm(),
        dateOfBirth,
        biologicalSex: sex ?? undefined,
        trainer: COACH_STYLES.find((c) => c.id === coach)?.v,
        experience: { calmMode: calm },
      });
      // the server only applies "calm" when it creates your settings, and the app has usually fetched them by now: set it explicitly
      if (calm) await api.me.updateSettings({ disclosure: { mode: "on_interaction" } }).catch(() => {});
      setDevicePrefs({ preferredDays: preferred });
      await refreshUser();
      router.replace("/dashboard");
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : "Couldn't save your setup. Try again.");
    }
  }

  const next = () => (step < LAST ? setStep(step + 1) : void finish());
  const wUnit = units === "imperial" ? "lb" : "kg";
  const recap = [
    { step: 0, label: "Goal", value: goalInfo?.label ?? "—" },
    { step: 1, label: "Experience", value: EXPERIENCE.find((e) => e.id === experience)?.label ?? "—" },
    { step: 2, label: "Schedule", value: `${days ?? "—"} days a week · ${sessionMin ?? "—"} min · ${[...preferred].sort((a, b) => a - b).map((d) => WEEKDAYS[d]).join(", ") || "no days picked"}` },
    { step: 3, label: "Where you train", value: `${ENVIRONMENTS.find((e) => e.id === location)?.label ?? "—"}${equipment.length ? ` · ${equipment.length} equipment` : ""}` },
    { step: 4, label: "Work around", value: areas.length ? areas.join(", ") : injuryNote.trim() || "Nothing" },
    { step: 5, label: "About you", value: [bodyweight && `${bodyweight} ${wUnit}`, h1 && (units === "imperial" ? `${h1}'${h2 || 0}"` : `${h1} cm`), birthYear && `born ${birthYear}`].filter(Boolean).join(" · ") || "Skipped" },
    { step: 6, label: "Coaching", value: `${COACH_STYLES.find((c) => c.id === coach)?.name} · ${calm ? "calm dashboard" : "full dashboard"}` },
  ];

  const input = { height: 50, borderRadius: 16, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.textPrimary, fontFamily: fonts.regular, fontSize: 16 } as const;
  const enter = motion.reduced ? FadeIn.duration(0) : FadeInRight.duration(280);

  return (
    <Screen>
      <ProgressBars step={step} />
      <Label style={{ marginTop: 10, marginBottom: 20 }}>STEP {step + 1} OF {STEPS.length} · {STEPS[step].label.toUpperCase()}</Label>

      <Animated.View key={step} entering={enter} style={{ gap: 16, minHeight: 380 }}>
        {step === 0 && (
          <>
            <Heading title="What's your main goal?" sub="Pick one. It shapes your program and what Kai coaches." />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {GOALS.map((g) => <Choice key={g.id} tile icon={g.icon} title={g.label} hint={g.hint} active={goal === g.id} onPress={() => setGoal(g.id)} />)}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Heading title="How experienced are you?" sub="Be honest. It sets your starting weights and how fast we progress." />
            <View style={{ gap: 10 }}>
              {EXPERIENCE.map((e) => <Choice key={e.id} icon={e.icon} title={e.label} hint={e.hint} active={experience === e.id} onPress={() => setExperience(e.id)} />)}
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Heading title="Build your week" sub={experience ? `${DAYS_HINT[experience]}.` : "How often, how long, and on which days."} />
            <Label>DAYS PER WEEK</Label>
            <View style={wrap}>{DAYS.map((d) => <Chip key={d} label={String(d)} active={days === d} onPress={() => setDays(d)} />)}</View>
            <Label>SESSION LENGTH</Label>
            <View style={wrap}>{DURATIONS.map((d) => <Chip key={d} label={`${d} min`} active={sessionMin === d} onPress={() => setSessionMin(d)} />)}</View>
            <Label>WHICH DAYS WORK BEST</Label>
            <View style={wrap}>{WEEKDAYS.map((d, i) => <Chip key={d} label={d} active={preferred.includes(i)} onPress={() => setPreferred(toggle(preferred, i))} />)}</View>
            {days && preferred.length > 0 && preferred.length !== days ? (
              <Text variant="meta" color="tertiary">{preferred.length < days ? `You picked ${preferred.length} of ${days} days. We'll fit the rest around them.` : `That's more than ${days} days, so we'll use the ones that fit best.`}</Text>
            ) : null}
            <Label>WEEK STARTS ON</Label>
            <View style={wrap}>
              <Chip label="Sunday" active={!mondayStart} onPress={() => setMondayStart(false)} />
              <Chip label="Monday" active={mondayStart} onPress={() => setMondayStart(true)} />
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Heading title="Where do you train?" sub="This picks which exercises you'll see." />
            <View style={{ gap: 10 }}>
              {ENVIRONMENTS.map((e) => <Choice key={e.id} icon={e.icon} title={e.label} hint={e.hint} active={location === e.id} onPress={() => pickLocation(e.id)} />)}
            </View>
            {equipmentAll.length ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Label>EQUIPMENT · {equipment.length} OF {equipmentAll.length}</Label>
                  <PressScale onPress={() => setEquipment(equipment.length === equipmentAll.length ? [] : equipmentAll.map((e) => e.key))} hitSlop={10}>
                    <Text variant="meta" color="pink">{equipment.length === equipmentAll.length ? "Clear" : "Select all"}</Text>
                  </PressScale>
                </View>
                <View style={wrap}>{equipmentAll.map((eq) => <Chip key={eq.key} label={eq.name} active={equipment.includes(eq.key)} onPress={() => setEquipment(toggle(equipment, eq.key))} />)}</View>
              </>
            ) : null}
          </>
        )}

        {step === 4 && (
          <>
            <Heading title="Anything to work around?" sub="Tap any area that's sore, injured or off limits. Kai will check in on these. Skip if nothing applies." />
            <View style={wrap}>{HEALTH_AREAS.map((a) => <Chip key={a} label={a} active={areas.includes(a)} onPress={() => setAreas(toggle(areas, a))} />)}</View>
            <Label>ANYTHING ELSE? (OPTIONAL)</Label>
            <TextInput value={injuryNote} onChangeText={setInjuryNote} multiline placeholder="e.g. no heavy overhead pressing, past ACL surgery" placeholderTextColor={colors.textTertiary} style={[input, { minHeight: 96, paddingTop: 14, textAlignVertical: "top" }]} />
          </>
        )}

        {step === 5 && (
          <>
            <Heading title="A few basics" sub="Optional. Helps Forma size your loads, calories and recovery targets." />
            <Label>UNITS</Label>
            <View style={wrap}>
              <Chip label="Pounds, feet" active={units === "imperial"} onPress={() => setUnits("imperial")} />
              <Chip label="Kilograms, cm" active={units === "metric"} onPress={() => setUnits("metric")} />
            </View>
            <Field label={`bodyweight (${wUnit})`} value={bodyweight} onChangeText={setBodyweight} keyboardType="decimal-pad" />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}><Field label={units === "imperial" ? "height (ft)" : "height (cm)"} value={h1} onChangeText={setH1} keyboardType="decimal-pad" /></View>
              {units === "imperial" ? <View style={{ flex: 1 }}><Field label="inches" value={h2} onChangeText={setH2} keyboardType="decimal-pad" /></View> : null}
            </View>
            <Field label="birth year" value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} />
            <Label>BIOLOGICAL SEX</Label>
            <View style={wrap}>{SEXES.map((s) => <Chip key={s.id} label={s.label} active={sex === s.id} onPress={() => setSex(s.id)} />)}</View>
          </>
        )}

        {step === 6 && (
          <>
            <Heading title="How should Kai coach you?" sub="You can change this anytime in Settings or on the Coach screen." />
            <View style={{ gap: 10 }}>
              {COACH_STYLES.map((c) => <Choice key={c.id} icon={c.icon} title={c.name} hint={c.line} active={coach === c.id} onPress={() => setCoach(c.id)} />)}
            </View>
            <Label style={{ marginTop: 6 }}>HOW SHOULD FORMA FEEL?</Label>
            <View style={{ gap: 10 }}>
              <Choice icon="speedometer-outline" title="Full" hint="Every number and chart, all features from day one." active={!calm} onPress={() => setCalm(false)} />
              <Choice icon="leaf-outline" title="Calm" hint="Details appear when you tap or scroll to them. Features unlock as you train." active={calm} onPress={() => setCalm(true)} />
            </View>
          </>
        )}

        {step === 7 && (
          <>
            <Heading title={`You're set${user?.name ? `, ${user.name.split(" ")[0]}` : ""}.`} sub={`Forma will build your first plan around ${goalInfo ? goalInfo.label.toLowerCase() : "your goal"}. Your next session is ${nextDay}.`} />
            <Recap rows={recap} onEdit={setStep} />
            {error ? <Text variant="meta" color="danger">{error}</Text> : null}
          </>
        )}
      </Animated.View>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
        {step > 0 ? <View style={{ flex: 1 }}><Button label="Back" variant="ghost" onPress={() => setStep(step - 1)} /></View> : null}
        <View style={{ flex: 2 }}>
          <Button label={step === LAST ? "Start training" : "Continue"} loading={submitting} disabled={!canNext} onPress={next} />
        </View>
      </View>
      {OPTIONAL.has(step) ? (
        <PressScale onPress={next} hitSlop={10} accessibilityLabel="Skip this step" style={{ alignSelf: "center", marginTop: 14 }}>
          <Text color="tertiary">Skip for now</Text>
        </PressScale>
      ) : null}
    </Screen>
  );
}
