/**
 * Persistent "workout in progress" pill that floats above the tab bar so an
 * unfinished session is always one tap away (website: WorkoutInProgressBar).
 * Refreshes when a tab regains focus or the app returns to the foreground.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, AppState, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/api/client";
import { useResource } from "@/api/hooks";
import type { WorkoutSession } from "@/api/types";
import { elapsedSec, progressOf, useActiveUI } from "@/lib/active-session";
import { fmtClock } from "@/lib/workouts";
import { colors, fonts, radius, shadow } from "@/theme/tokens";
import { Text } from "./ui/text";

export const useActiveSession = () =>
  useResource<WorkoutSession | null>("active-session", () => api.sessions.list({ status: "in_progress", take: 1 }).then((l) => l[0] ?? null));

export function WorkoutInProgressBar({ bottom }: { bottom: number }) {
  const router = useRouter();
  const active = useActiveSession();
  const s = active.data;
  const ui = useActiveUI(s?.id);
  const [now, setNow] = useState(Date.now());
  const a = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      active.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && active.refetch());
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!s) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [s]);
  useEffect(() => {
    Animated.spring(a, { toValue: s ? 1 : 0, useNativeDriver: true, stiffness: 260, damping: 24 }).start();
  }, [s, a]);

  if (!s) return null;
  const p = progressOf(s, ui);
  return (
    <Animated.View
      style={{ position: "absolute", left: 16, right: 16, bottom, alignItems: "center", opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${ui.paused ? "Workout paused" : "Workout in progress"}, ${s.name}. Resume`}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          router.push("/workout/active");
        }}
        style={({ pressed }) => [
          { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingLeft: 10, paddingRight: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceOpaque, borderWidth: 1, borderColor: colors.lineSoft, maxWidth: "100%", transform: [{ scale: pressed ? 0.98 : 1 }] },
          shadow.float,
        ]}
      >
        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(213,26,122,0.2)" }}>
          <Ionicons name={ui.paused ? "pause" : "barbell"} size={15} color={colors.pink} />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 14 }}>{ui.paused ? "Workout paused" : "Workout in progress"}</Text>
          <Text numberOfLines={1} variant="meta" color="tertiary">
            {s.name} · {fmtClock(elapsedSec(s, ui, now))}
            {p.setsTotal ? ` · ${p.setsDone}/${p.setsTotal} sets` : ""}
          </Text>
        </View>
        <View style={{ paddingHorizontal: 12, height: 28, borderRadius: 14, backgroundColor: colors.pink, justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 12, fontFamily: fonts.semibold }}>Resume</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
