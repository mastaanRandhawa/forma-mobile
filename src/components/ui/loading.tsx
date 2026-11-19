/**
 * Shared loading system.
 *  • Skeleton presets for initial loads (cards, rows).
 *  • <Stateful> crossfades between loading → error → empty → ready instead of snapping.
 *  • useGrowingList / useIncremental page long lists as the user scrolls.
 *  • <ListFooter> is the single pagination indicator (spinner while loading more).
 * Pull-to-refresh lives in <Screen onRefresh> (guarded against double fires, toasts on failure).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useResource } from "@/api/hooks";
import { motion } from "@/lib/motion";
import { EASE_LUXURY } from "@/lib/ease";
import { colors } from "@/theme/tokens";
import { Skel } from "./extra";
import { Text } from "./text";

/** A column of card-shaped skeletons. */
export function SkelCards({ count = 3, h = 96, r = 24 }: { count?: number; h?: number; r?: number }) {
  return <View style={{ gap: 12 }}>{Array.from({ length: count }, (_, i) => <Skel key={i} h={h} r={r} />)}</View>;
}

/** Skeleton for a list of two-line rows with a leading thumbnail. */
export function SkelRows({ count = 5, thumb = 44 }: { count?: number; thumb?: number }) {
  return (
    <View style={{ gap: 14 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Skel h={thumb} w={thumb} r={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skel h={14} w="70%" />
            <Skel h={11} w="45%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Fades its content in whenever `id` changes — the crossfade between load states. */
export function FadeSwap({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(motion.reduced ? 1 : 0);
  useEffect(() => {
    o.set(motion.reduced ? 1 : 0);
    o.set(withTiming(1, { duration: motion.reduced ? 0 : 220, easing: EASE_LUXURY }));
  }, [id, o]);
  const fade = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[style, fade]}>{children}</Animated.View>;
}

/** Picks one of loading / error / empty / ready and crossfades between them. */
export function Stateful({ loading, error, empty, skeleton, errorView, emptyView, children }: { loading: boolean; error?: boolean; empty?: boolean; skeleton: ReactNode; errorView?: ReactNode; emptyView?: ReactNode; children: ReactNode }) {
  const state = loading ? "loading" : error ? "error" : empty ? "empty" : "ready";
  return (
    <FadeSwap id={state}>
      {state === "loading" ? skeleton : state === "error" ? errorView : state === "empty" ? emptyView : children}
    </FadeSwap>
  );
}

/** Pagination indicator: spinner while loading more, a quiet line at the end of a long list. */
export function ListFooter({ loading, done, label = "You're all caught up" }: { loading: boolean; done?: boolean; label?: string }) {
  if (loading) return <View style={{ paddingVertical: 18, alignItems: "center" }} accessibilityLabel="Loading more"><ActivityIndicator color={colors.textTertiary} /></View>;
  if (done) return <Text variant="meta" color="tertiary" style={{ textAlign: "center", paddingVertical: 16 }}>{label}</Text>;
  return null;
}

/** Client-side paging over an already-loaded array. */
export function useIncremental<T>(items: T[], pageSize = 12) {
  const [count, setCount] = useState(pageSize);
  const visible = useMemo(() => items.slice(0, count), [items, count]);
  const hasMore = count < items.length;
  const loadMore = useCallback(() => setCount((c) => (c < items.length ? c + pageSize : c)), [items.length, pageSize]);
  return { visible, hasMore, loadMore, reset: () => setCount(pageSize) };
}

/**
 * Server paging for endpoints that only take `take`: ask for a bigger window each
 * time the user reaches the end. The previous page stays on screen while the next
 * one loads, so the list never blinks.
 */
export function useGrowingList<T>(key: string, fetcher: (take: number) => Promise<T[]>, pageSize = 20) {
  const [take, setTake] = useState(pageSize);
  const res = useResource<T[]>(`${key}:${take}`, () => fetcher(take));
  const last = useRef<T[] | null>(null);
  if (res.data) last.current = res.data;
  const items = res.data ?? last.current ?? [];
  const loadingMore = res.loading && last.current != null && !res.data;
  const hasMore = !!res.data && res.data.length >= take;
  const loadMore = useCallback(() => {
    if (hasMore && !res.loading) setTake((t) => t + pageSize);
  }, [hasMore, res.loading, pageSize]);
  return {
    items,
    initialLoading: res.initialLoading && last.current == null,
    loadingMore,
    hasMore,
    error: res.error,
    loadMore,
    reload: async () => {
      setTake(pageSize);
      await res.reload();
    },
    refetch: res.refetch,
  };
}
