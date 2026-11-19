import type { Ionicons } from "@expo/vector-icons";

export type TourStep = {
  id: string;
  /** which screen the target lives on */
  route: "/dashboard" | "/workouts" | "/nutrition" | "/trainer";
  /** registered <TourTarget id> */
  target: string;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** the target is pinned to the screen edge (tab bar) — don't try to scroll it into view */
  pinned?: boolean;
};

/**
 * The shortest path to value: where today's workout is, how to log things,
 * where your account lives, how to move around, and how to ask Kai. Each step
 * covers one idea and points at something that exists on that screen.
 */
export const TOUR_STEPS: TourStep[] = [
  // Home
  { id: "readiness", route: "/dashboard", target: "home-readiness", icon: "pulse-outline", title: "How ready you are", body: "A daily score from your sleep, soreness and recent training. Tap it to see what's driving it." },
  { id: "today", route: "/dashboard", target: "home-today", icon: "barbell-outline", title: "Today's workout", body: "Your plan for the day. Tap to start it, or let Kai build one if nothing is scheduled." },
  { id: "quicklog", route: "/dashboard", target: "home-quicklog", icon: "flash-outline", title: "Log in a tap", body: "Food, weight, water and your daily check-in. Check-ins help Kai tune your training." },
  { id: "profile", route: "/dashboard", target: "home-profile", icon: "person-circle-outline", title: "Your account", body: "Settings, notifications, the store and this tour live behind your avatar." },
  // Navigation
  { id: "dock", route: "/dashboard", target: "dock", pinned: true, icon: "swap-horizontal-outline", title: "Get around", body: "Home, Train, Nutrition and Coach. Tap a tab, or press and hold, then slide across to switch." },
  // Train
  { id: "train-tabs", route: "/workouts", target: "train-tabs", icon: "calendar-outline", title: "Plan, review, reuse", body: "Today is your session, History is what you've done, and Templates holds saved and prebuilt workouts." },
  { id: "train-start", route: "/workouts", target: "train-start", icon: "play-circle-outline", title: "Start training", body: "Start your planned workout, or Quick start to begin an empty one and add exercises as you go." },
  { id: "train-create", route: "/workouts", target: "train-create", icon: "add-circle-outline", title: "Build your own", body: "Create a custom workout from the exercise library and save it as a template." },
  { id: "train-insights", route: "/workouts", target: "train-insights", icon: "stats-chart-outline", title: "Insights and tools", body: "Progress, body map, records, goals and the exercise library are all here." },
  // Nutrition
  { id: "nutrition", route: "/nutrition", target: "nutrition-summary", icon: "nutrition-outline", title: "Calories at a glance", body: "The ring shows what's left today. Protein, carbs and fat sit just below, against your targets." },
  { id: "addfood", route: "/nutrition", target: "nutrition-add", icon: "add-circle-outline", title: "Add food", body: "Search, scan a barcode or enter calories by hand. Swipe a logged food left to remove it." },
  { id: "nutrition-quick", route: "/nutrition", target: "nutrition-quick", icon: "flash-outline", title: "Shortcuts", body: "Quick add calories, scan a barcode, or copy yesterday's meals in one tap." },
  { id: "nutrition-tabs", route: "/nutrition", target: "nutrition-tabs", icon: "trending-up-outline", title: "Spot the trend", body: "Switch to Trends to see your calories and protein over recent days." },
  // Coach
  { id: "kai", route: "/trainer", target: "coach-composer", icon: "chatbubble-ellipses-outline", title: "Ask Kai anything", body: "Questions about form, today's session or a lift. Kai knows your plan and your history." },
  { id: "kai-menu", route: "/trainer", target: "coach-menu", icon: "options-outline", title: "Kai's menu", body: "Quick actions, coaching insights, and a few ready-made coaching styles to change how Kai talks to you." },
];
