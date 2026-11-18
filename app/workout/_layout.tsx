import { Stack } from "expo-router";
import { colors } from "@/theme/tokens";

export default function WorkoutLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "slide_from_right" }} />;
}
