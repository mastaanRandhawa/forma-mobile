import { Stack } from "expo-router";
import { AtmosphereHost } from "@/components/ui/atmosphere";
import { colors } from "@/theme/tokens";

/** Full-screen modal: it sits above the root atmosphere, so screens paint their own. */
export default function WorkoutLayout() {
  return (
    <AtmosphereHost.Provider value={false}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "slide_from_right", animationDuration: 260 }} />
    </AtmosphereHost.Provider>
  );
}
