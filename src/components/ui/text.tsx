import { useContext } from "react";
import { useTheme } from "@/theme/theme-provider";
import { StyleSheet, Text as RNText, type StyleProp, type TextProps, type TextStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { withAlpha } from "@/lib/color";
import { QuietCtx } from "./quiet-context";
import { colors, fonts, type } from "@/theme/tokens";

type Variant = keyof typeof type;
type Color = "primary" | "secondary" | "tertiary" | "dark" | "pink" | "danger";

/** Read live from the palette so theme switches apply on the next render. */
const colorOf: Record<Color, string> = {
  get primary() { return colors.textPrimary; },
  get secondary() { return colors.textSecondary; },
  get tertiary() { return colors.textTertiary; },
  get dark() { return colors.textDark; },
  get pink() { return colors.pinkSoft; },
  get danger() { return colors.danger; },
};

/** Text whose ink fades out while its enclosing <Quiet> is hiding values. */
function QuietText({ q, style, ...rest }: TextProps & { q: SharedValue<number> }) {
  const flat = StyleSheet.flatten(style) as TextStyle;
  const on = typeof flat.color === "string" ? flat.color : colors.textPrimary;
  const off = withAlpha(on, 0);
  const fade = useAnimatedStyle(() => ({ color: interpolateColor(q.value, [0, 1], [on, off]) }));
  return <Animated.Text {...rest} style={[flat, fade]} />;
}

export function Text({
  variant = "body",
  color = "primary",
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: Color }) {
  useTheme();
  const q = useContext(QuietCtx);
  const merged: StyleProp<TextStyle> = [type[variant] as TextStyle, { color: colorOf[color] }, style];
  return q ? <QuietText q={q} {...rest} style={merged} /> : <RNText {...rest} style={merged} />;
}

/** Numbers always use Space Grotesk with tabular figures. */
export function Num({
  size = 28,
  color = "primary",
  style,
  ...rest
}: TextProps & { size?: number; color?: Color }) {
  useTheme();
  const q = useContext(QuietCtx);
  const merged: StyleProp<TextStyle> = [
        {
          fontFamily: fonts.num,
          fontSize: size,
          lineHeight: size,
          letterSpacing: -size * 0.02,
          fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
          color: colorOf[color],
        },
    style,
  ];
  return q ? <QuietText q={q} {...rest} style={merged} /> : <RNText {...rest} style={merged} />;
}

/** Small uppercase-ish technical label. */
export function Label({ children, style, ...rest }: TextProps) {
  useTheme();
  return (
    <RNText {...rest} style={[type.meta as TextStyle, { color: colors.textTertiary }, style]}>
      {children}
    </RNText>
  );
}
