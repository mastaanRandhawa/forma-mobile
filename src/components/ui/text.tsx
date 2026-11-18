import { useTheme } from "@/theme/theme-provider";
import { Text as RNText, type TextProps, type TextStyle } from "react-native";
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

export function Text({
  variant = "body",
  color = "primary",
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: Color }) {
  useTheme();
  return <RNText {...rest} style={[type[variant] as TextStyle, { color: colorOf[color] }, style]} />;
}

/** Numbers always use Space Grotesk with tabular figures. */
export function Num({
  size = 28,
  color = "primary",
  style,
  ...rest
}: TextProps & { size?: number; color?: Color }) {
  useTheme();
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: fonts.num,
          fontSize: size,
          lineHeight: size,
          letterSpacing: -size * 0.02,
          fontVariant: ["tabular-nums"],
          color: colorOf[color],
        },
        style,
      ]}
    />
  );
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
