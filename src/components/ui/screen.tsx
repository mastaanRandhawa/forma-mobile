import { useTheme } from "@/theme/theme-provider";
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Atmosphere, useHasGlobalAtmosphere } from "./atmosphere";
import { Reveal } from "./reveal";
import { useNavChrome } from "@/components/nav-chrome";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useNavigation } from "expo-router";
import { motion } from "@/lib/motion";
import { EASE_LUXURY } from "@/lib/ease";
import { toast } from "./toast";
import { errorMessage } from "@/api/hooks";
import { ScrollYCtx } from "./quiet-context";
import { TourScrollCtx } from "@/components/tour/tour";
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
  /** pull-to-refresh: return a promise to keep the spinner up until it settles; failures toast */
  onRefresh?: () => Promise<unknown> | void;
  /** fires (once per approach) when the user scrolls near the bottom — for pagination */
  onEndReached?: () => void;
  /** cascade the top-level blocks in on mount (default true) */
  reveal?: boolean;
};

export function Screen({ children, scroll = true, tabs = false, contentStyle, onRefresh, onEndReached, reveal = true }: ScreenProps) {
  useTheme();
  // pull-to-refresh: one request at a time, spinner until it settles, toast if it fails
  const [spinning, setSpinning] = useState(false);
  const spinLock = useRef(false);
  const handleRefresh = useCallback(async () => {
    if (spinLock.current || !onRefresh) return;
    spinLock.current = true;
    setSpinning(true);
    try {
      await Promise.all([onRefresh(), new Promise((r) => setTimeout(r, 450))]);
    } catch (e) {
      toast.error(`Couldn't refresh. ${errorMessage(e as Error)}`);
    } finally {
      spinLock.current = false;
      setSpinning(false);
    }
  }, [onRefresh]);
  const endLock = useRef(false);

  const hasGlobal = useHasGlobalAtmosphere();
  const nav = useNavChrome();
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollBy = useCallback((dy: number) => scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.get() + dy), animated: true }), [scrollY]);
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
    <FocusScene>
      {hasGlobal ? null : <Atmosphere />}
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[pad, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            scrollY.set(e.nativeEvent.contentOffset.y);
            if (tabs) nav.onScroll(e);
            if (onEndReached) {
              const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
              const near = contentOffset.y + layoutMeasurement.height >= contentSize.height - 480;
              if (near && !endLock.current) {
                endLock.current = true;
                onEndReached();
              } else if (!near) endLock.current = false;
            }
          }}
          scrollEventThrottle={16}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={spinning} onRefresh={handleRefresh} tintColor={colors.pinkSoft} colors={[colors.pink]} progressBackgroundColor={colors.surfaceOpaque} />
            ) : undefined
          }
        >
          <TourScrollCtx.Provider value={scrollBy}>
          <ScrollYCtx.Provider value={scrollY}>
            {reveal ? Children.toArray(children).map((c, i) => <Reveal key={(c as { key?: string }).key ?? i} index={i}>{c}</Reveal>) : children}
          </ScrollYCtx.Provider>
          </TourScrollCtx.Provider>
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
    </FocusScene>
  );
}

/**
 * The tab navigator is transparent (so the atmosphere shows through) and keeps
 * every tab mounted, so a screen has to hide itself the moment it loses focus —
 * otherwise two screens draw at once. It fades back in when focus returns; the
 * outgoing screen is simply gone. `Screen` uses this; a tab screen that builds
 * its own layout (the Coach chat) must wrap its root in it too.
 */
export function FocusScene({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const navigation = useNavigation();
  const [focused, setFocused] = useState(() => navigation.isFocused());
  const focusO = useSharedValue(navigation.isFocused() ? 1 : 0);
  useEffect(() => {
    const on = navigation.addListener("focus", () => {
      setFocused(true);
      focusO.set(motion.reduced ? 1 : 0);
      focusO.set(withTiming(1, { duration: motion.reduced ? 0 : 240, easing: EASE_LUXURY }));
    });
    const off = navigation.addListener("blur", () => {
      setFocused(false);
      focusO.set(0);
    });
    return () => {
      on();
      off();
    };
  }, [navigation, focusO]);
  const focusStyle = useAnimatedStyle(() => ({ opacity: focusO.get() }));
  return (
    <Animated.View pointerEvents={focused ? "auto" : "none"} style={[styles.root, style, focusStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
