import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { colors } from "@/theme/tokens";
import { Screen } from "./screen";
import { SoftSurface } from "./surface";
import { Text } from "./text";

/** The Forma wordmark glyph — a soft chevron cut from the pink→coral gradient. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Defs>
        <SvgGradient id="m" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors.pink} />
          <Stop offset="1" stopColor={colors.coral} />
        </SvgGradient>
      </Defs>
      <Path d="M5 23 L16 5 L27 23 L21.5 23 L16 13.5 L10.5 23 Z" fill="url(#m)" />
      <Path d="M16 27 a10 10 0 0 1 -10 -10" stroke={colors.pink} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen contentStyle={{ flexGrow: 1, justifyContent: "center", gap: 24 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <Mark size={40} />
          <Text variant="meta" color="tertiary" style={{ letterSpacing: 4 }}>FORMA</Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="title">{title}</Text>
          {subtitle ? <Text color="secondary">{subtitle}</Text> : null}
        </View>
        <SoftSurface style={{ padding: 20, gap: 16 }}>{children}</SoftSurface>
        {footer}
      </Screen>
    </KeyboardAvoidingView>
  );
}
