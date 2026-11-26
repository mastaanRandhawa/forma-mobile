import type { Ionicons } from "@expo/vector-icons";
import type { ExperienceLevel, FitnessGoal, TrainerPatch, TrainingLocation } from "@/api/types";

type Icon = keyof typeof Ionicons.glyphMap;

/** Training-profile option lists — shared by onboarding and Settings › Training (as on the web). */
export const GOALS: { id: FitnessGoal; label: string; hint: string; icon: Icon }[] = [
  { id: "lose_fat", label: "Lose fat", hint: "Burn more than you eat, keep your muscle", icon: "flame-outline" },
  { id: "build_muscle", label: "Build muscle", hint: "Add size with steady volume", icon: "barbell-outline" },
  { id: "get_stronger", label: "Get stronger", hint: "Heavier lifts, lower reps", icon: "trending-up-outline" },
  { id: "general_fitness", label: "General fitness", hint: "Feel capable and healthy", icon: "heart-outline" },
  { id: "athletic_performance", label: "Athletic performance", hint: "Power, speed and conditioning", icon: "speedometer-outline" },
  { id: "maintain", label: "Maintain", hint: "Hold what you've built", icon: "shield-checkmark-outline" },
];
export const GOAL_LABELS: Record<string, string> = Object.fromEntries(GOALS.map((g) => [g.id, g.label]));

export const EXPERIENCE: { id: ExperienceLevel; label: string; hint: string; icon: Icon }[] = [
  { id: "beginner", label: "Beginner", hint: "New, or back after a long break. We'll teach the movements first.", icon: "leaf-outline" },
  { id: "intermediate", label: "Intermediate", hint: "Training consistently for 6+ months. Progressive overload is familiar.", icon: "bar-chart-outline" },
  { id: "advanced", label: "Advanced", hint: "Years of structured training. Expect heavier, more specific work.", icon: "trophy-outline" },
];

export const DAYS = [2, 3, 4, 5, 6];
export const DURATIONS = [30, 45, 60, 75];

export const ENVIRONMENTS: { id: TrainingLocation; label: string; hint: string; icon: Icon }[] = [
  { id: "gym", label: "Full gym", hint: "Racks, machines, cables and free weights", icon: "business-outline" },
  { id: "home", label: "Home setup", hint: "Whatever you have at home", icon: "home-outline" },
  { id: "both", label: "Both", hint: "Some days at the gym, some at home", icon: "swap-horizontal-outline" },
];

/** Recommended session counts, used to hint the schedule step. */
export const DAYS_HINT: Record<ExperienceLevel, string> = {
  beginner: "3 days is a great start",
  intermediate: "4 days suits most people",
  advanced: "4–6 days, with a rest day or two",
};

/** Body areas to work around. The label is what Kai says back ("How's your lower back feeling today?"). */
export const HEALTH_AREAS = ["Neck", "Shoulder", "Elbow", "Wrist", "Upper back", "Lower back", "Hip", "Knee", "Ankle"];

/** Coaching styles — the same five presets as the Coach screen, so Settings shows what you picked here. */
export const COACH_STYLES: { id: string; name: string; line: string; icon: Icon; v: TrainerPatch }[] = [
  { id: "steady", name: "Steady", line: "Balanced, encouraging, to the point.", icon: "options-outline", v: { coachingDirectness: 0.5, motivationLevel: 0.5, coachingDetail: 0.5, formStrictness: 0.5, speakingFrequency: 0.5, humor: 0.4 } },
  { id: "spark", name: "Spark", line: "High energy and playful. Keeps you moving.", icon: "flash-outline", v: { coachingDirectness: 0.5, motivationLevel: 0.9, coachingDetail: 0.4, formStrictness: 0.4, speakingFrequency: 0.8, humor: 0.8 } },
  { id: "straight", name: "Straight talk", line: "Blunt, strict on form, no fluff.", icon: "locate-outline", v: { coachingDirectness: 0.9, motivationLevel: 0.5, coachingDetail: 0.5, formStrictness: 0.85, speakingFrequency: 0.5, humor: 0.2 } },
  { id: "analyst", name: "Analyst", line: "Thorough, data-minded, rarely jokes.", icon: "analytics-outline", v: { coachingDirectness: 0.7, motivationLevel: 0.3, coachingDetail: 0.95, formStrictness: 0.8, speakingFrequency: 0.5, humor: 0.1 } },
  { id: "calm", name: "Calm", line: "Gentle, quiet and patient.", icon: "leaf-outline", v: { coachingDirectness: 0.25, motivationLevel: 0.2, coachingDetail: 0.6, formStrictness: 0.4, speakingFrequency: 0.3, humor: 0.4 } },
];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const LB_TO_KG = 0.453592;
export const KG_TO_LB = 1 / LB_TO_KG;
export const IN_TO_CM = 2.54;

export const fmtWeight = (kg: number, units: "metric" | "imperial") =>
  units === "metric" ? `${Math.round(kg * 10) / 10} kg` : `${Math.round(kg * KG_TO_LB)} lb`;
