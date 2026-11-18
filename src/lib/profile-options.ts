import type { ExperienceLevel, FitnessGoal, TrainingLocation } from "@/api/types";

/** Training-profile option lists — shared by onboarding and Settings › Training (as on the web). */
export const GOALS: { id: FitnessGoal; label: string }[] = [
  { id: "lose_fat", label: "Lose fat" },
  { id: "build_muscle", label: "Build muscle" },
  { id: "get_stronger", label: "Get stronger" },
  { id: "general_fitness", label: "General fitness" },
  { id: "athletic_performance", label: "Athletic performance" },
  { id: "maintain", label: "Maintain" },
];
export const GOAL_LABELS: Record<string, string> = Object.fromEntries(GOALS.map((g) => [g.id, g.label]));

export const EXPERIENCE: { id: ExperienceLevel; label: string; hint: string }[] = [
  { id: "beginner", label: "Beginner", hint: "New, or back after a long break" },
  { id: "intermediate", label: "Intermediate", hint: "Training consistently for 6+ months" },
  { id: "advanced", label: "Advanced", hint: "Years of structured training" },
];

export const DAYS = [2, 3, 4, 5, 6];
export const DURATIONS = [30, 45, 60, 75];

export const ENVIRONMENTS: { id: TrainingLocation; label: string }[] = [
  { id: "gym", label: "Full gym" },
  { id: "home", label: "Home setup" },
  { id: "both", label: "Both" },
];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const LB_TO_KG = 0.453592;
export const KG_TO_LB = 1 / LB_TO_KG;
export const IN_TO_CM = 2.54;

export const fmtWeight = (kg: number, units: "metric" | "imperial") =>
  units === "metric" ? `${Math.round(kg * 10) / 10} kg` : `${Math.round(kg * KG_TO_LB)} lb`;
