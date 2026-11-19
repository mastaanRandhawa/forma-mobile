/**
 * Quiet — progressive disclosure for a dashboard widget (website:
 * components/Quiet.tsx).
 *
 * When a widget's detail mode is "When interacting", the widget is still drawn
 * in full — title, rings, bars, chart shapes — but its figures and copy fade to
 * transparent (see `QuietCtx`). Nothing overlays it and nothing shifts on
 * reveal. Same triggers as the website's touch behaviour:
 *  • the widget reveals while it sits near the vertical centre of the screen
 *    and fades back as it scrolls away;
 *  • a tap reveals it too and holds for about a second.
 * "Always" renders straight through.
 */
import { useContext, useEffect, useRef, type ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { measure, useAnimatedReaction, useAnimatedRef, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { useWidgetMode } from "@/api/settings";
import { EASE_LUXURY } from "@/lib/ease";
import { motion } from "@/lib/motion";
import { QuietCtx, ScrollYCtx } from "./ui/quiet-context";

const LINGER_MS = 1000;
const FADE_MS = 420;

export function Quiet({ widgetKey, children }: { widgetKey: string; children: ReactNode }) {
  const mode = useWidgetMode(widgetKey);
  const scrollY = useContext(ScrollYCtx);
  const { height } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.View>();
  const hidden = useSharedValue(1);
  const pinned = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = mode !== "always";

  // near-centre of the screen → shown; scrolled away → hidden again (after 260ms)
  useAnimatedReaction(
    () => {
      if (!active) return 1;
      if (pinned.get()) return 1;
      if (scrollY) void scrollY.get(); // re-evaluate on every scroll frame
      const m = measure(ref);
      if (!m) return -1;
      return Math.abs(m.pageY + m.height / 2 - height / 2) < height * 0.22 ? 1 : 0;
    },
    (show, prev) => {
      if (show === prev || show < 0) return;
      const dur = motion.reduced ? 0 : FADE_MS;
      hidden.set(show ? withTiming(0, { duration: dur, easing: EASE_LUXURY }) : withDelay(motion.reduced ? 0 : 260, withTiming(1, { duration: dur, easing: EASE_LUXURY })));
    },
    [active, height],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  if (!active) return <>{children}</>;

  const tap = () => {
    pinned.set(1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => pinned.set(0), LINGER_MS);
  };

  return (
    <QuietCtx.Provider value={hidden}>
      <Animated.View ref={ref} collapsable={false} onTouchStart={tap} {...({ onPointerDown: tap } as object)}>
        {children}
      </Animated.View>
    </QuietCtx.Provider>
  );
}
