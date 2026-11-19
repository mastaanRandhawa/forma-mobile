import { useTheme } from "@/theme/theme-provider";
import { Children, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Atmosphere, useHasGlobalAtmosphere } from "./atmosphere";
import { Reveal } from "./reveal";
import { useNavChrome } from "@/components/nav-chrome";
import { useSharedValue } from "react-native-reanimated";
import { ScrollYCtx } from "./quiet-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, space } from "@/theme/tokens";
import { contentBottomPad } from "@/components/dock-metrics";
import { api } from "@/api/client";
import { useResource } from "@/api/hooks";
import type { WorkoutSession } from "@/api/types";

export { Atmosphere } from "./atmosphere";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /** leave room for the floating tab bar */
  tabs?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** cascade the top-level blocks in on mount (default true) */
  reveal?: boolean;
};

export function Screen({ children, scroll = true, tabs = false, contentStyle, refreshing, onRefresh, reveal = true }: ScreenProps) {
  useTheme();
  const hasGlobal = useHasGlobalAtmosphere();
  const nav = useNavChrome();
  const scrollY = useSharedValue(0);
  const insets = useSafeAreaInsets();
  // same cache key as the workout pill, so tab screens share one request; other screens skip it
  const bar = useResource<WorkoutSession | null>(tabs ? "active-session" : "active-session:off", () =>
    tabs ? api.sessions.list({ status: "in_progress", take: 1 }).then((l) => l[0] ?? null) : Promise.resolve(null),
  );
  const pad: ViewStyle = {
    paddingTop: insets.top + 12,
    paddingHorizontal: space.page,
    // leave room for the floating tab bar, plus the workout pill when one is running
    paddingBottom: tabs ? contentBottomPad(insets.bottom, !!bar.data) : 24 + insets.bottom,
  };
  return (
    <View style={styles.root}>
      {hasGlobal ? null : <Atmosphere />}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            scrollY.set(e.nativeEvent.contentOffset.y);
            if (tabs) nav.onScroll(e);
          }}
          scrollEventThrottle={16}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.pinkSoft} />
            ) : undefined
          }
        >
          <ScrollYCtx.Provider value={scrollY}>
            {reveal ? Children.toArray(children).map((c, i) => <Reveal key={(c as { key?: string }).key ?? i} index={i}>{c}</Reveal>) : children}
          </ScrollYCtx.Provider>
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
