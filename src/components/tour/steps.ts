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
  { id: "today", route: "/dashboard", target: "home-today", icon: "barbell-outline", title: "Today's workout", body: "Your plan for the day lives here. Tap to start it. If nothing is scheduled, Kai can build one for you." },
  { id: "quicklog", route: "/dashboard", target: "home-quicklog", icon: "flash-outline", title: "Log in a tap", body: "Food, weight, water and your daily check-in are one tap away. Check-ins help Kai tune your training." },
  { id: "profile", route: "/dashboard", target: "home-profile", icon: "person-circle-outline", title: "Your account", body: "Settings, notifications, the store and this tour all live behind your avatar." },
  { id: "dock", route: "/dashboard", target: "dock", pinned: true, icon: "swap-horizontal-outline", title: "Get around", body: "Home, Train, Nutrition and Coach. Tap a tab, or press and hold then slide your finger across to switch." },
  { id: "train", route: "/workouts", target: "train-tabs", icon: "calendar-outline", title: "Plan, review, reuse", body: "Today shows your session, History shows what you've done, and Templates holds your saved and prebuilt workouts." },
  { id: "nutrition", route: "/nutrition", target: "nutrition-summary", icon: "nutrition-outline", title: "Calories at a glance", body: "The ring shows what's left for the day. Protein, carbs and fat sit just below, against your targets." },
  { id: "addfood", route: "/nutrition", target: "nutrition-add", icon: "add-circle-outline", title: "Add food fast", body: "Search, scan a barcode or enter calories by hand. Swipe a logged food left to remove it." },
  { id: "kai", route: "/trainer", target: "coach-composer", icon: "chatbubble-ellipses-outline", title: "Ask Kai anything", body: "Questions about form, today's session or a lift. The menu above has quick actions and Kai's coaching style." },
];
