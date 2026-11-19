/**
 * The four surface materials from the website (soft / raised / recessed /
 * glass), rebuilt so every gradient is a true multi-stop SVG fill — no hard
 * bands, no 1px "light strips" faking an inset highlight. Highlights and inner
 * shadows are smooth vertical fades.
 *
 * Dark mode: translucent frosted fills with wine-tinted depth.
 * Light mode: near-opaque white cards, neutral compact shadows (depth, not
 * glow) — the website's light-mode translation layer.
 */
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "@/theme/theme-provider";
import { ambient, colors, radius, shadow } from "@/theme/tokens";
import { withAlpha } from "@/lib/color";
import { Fill } from "./gradient";
import { PressScale } from "./pressable";

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  radiusSize?: keyof typeof radius;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

const isLight = () => ambient.mode === "light";

function wrap(body: ReactNode, { onPress, accessibilityLabel, accessibilityHint }: Props) {
  return onPress ? (
    <PressScale onPress={onPress} to={0.985} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}>
      {body}
    </PressScale>
  ) : (
    body
  );
}

/** surface-soft — broad molded regions (cards). */
export function SoftSurface(props: Props) {
  useTheme();
  const { children, style, radiusSize = "large" } = props;
  const light = isLight();
  const body = (
    <View style={[{ borderRadius: radius[radiusSize], borderWidth: light ? 1 : 0, borderColor: colors.hairline, overflow: "hidden" }, shadow.soft, light ? { backgroundColor: colors.surface } : null, style]}>
      {!light ? <Fill angle={150} stops={[{ color: colors.surfaceGlass, at: 0 }, { color: colors.surface, at: 0.6 }, { color: withAlpha(colors.wine, 0.07), at: 1 }]} /> : null}
      {/* soft top sheen — replaces the web's 1px inset line with a smooth falloff */}
      <Fill angle={180} stops={[{ color: withAlpha(colors.highlight, light ? 0.5 : 0.1), at: 0 }, { color: withAlpha(colors.highlight, 0), at: 0.4 }]} />
      {children}
    </View>
  );
  return wrap(body, props);
}

/** surface-raised — tactile primary controls. */
export function RaisedSurface(props: Props) {
  useTheme();
  const { children, style, radiusSize = "medium" } = props;
  const light = isLight();
  const body = (
    <View style={[{ borderRadius: radius[radiusSize], borderWidth: light ? 1 : 0, borderColor: colors.hairline, overflow: "hidden" }, shadow.raised, light ? { backgroundColor: colors.surfaceRaised } : null, style]}>
      {!light ? <Fill angle={155} stops={[{ color: colors.surfaceFloat, at: 0 }, { color: colors.surface, at: 0.55 }, { color: withAlpha(colors.wine, 0.1), at: 1 }]} /> : null}
      <Fill angle={180} stops={[{ color: withAlpha(colors.highlight, light ? 0.7 : 0.14), at: 0 }, { color: withAlpha(colors.highlight, 0), at: 0.38 }]} />
      {children}
    </View>
  );
  return wrap(body, props);
}

/** surface-recessed — carved-in wells: inputs, dial tracks, date strips. */
export function RecessedSurface({ children, style, radiusSize = "medium" }: Props) {
  useTheme();
  const light = isLight();
  return (
    <View style={[{ borderRadius: radius[radiusSize], backgroundColor: colors.surfaceRecessed, borderWidth: light ? 1 : 0, borderColor: colors.hairline, overflow: "hidden" }, style]}>
      {/* inner shadow: darkest at the top edge, easing to nothing — no step */}
      <Fill angle={180} stops={light ? [{ color: "rgba(41,28,45,0.075)", at: 0 }, { color: "rgba(41,28,45,0.03)", at: 0.25 }, { color: "rgba(41,28,45,0)", at: 0.65 }] : [{ color: "rgba(24,4,20,0.5)", at: 0 }, { color: "rgba(24,4,20,0.2)", at: 0.22 }, { color: "rgba(24,4,20,0)", at: 0.6 }]} />
      {children}
    </View>
  );
}

/** surface-glass — floating nav and overlays. */
export function GlassSurface({ children, style, radiusSize = "large" }: Props) {
  useTheme();
  const light = isLight();
  return (
    <View style={[{ borderRadius: radius[radiusSize], overflow: "hidden", borderWidth: 1, borderColor: light ? "rgba(35,25,40,0.07)" : "rgba(255,255,255,0.10)" }, style]}>
      <BlurView intensity={light ? 60 : 40} tint={light ? "light" : "dark"} style={StyleSheet.absoluteFill} />
      <Fill
        angle={180}
        stops={light ? [{ color: "rgba(255,255,255,0.86)", at: 0 }, { color: "rgba(255,255,255,0.8)", at: 1 }] : [{ color: withAlpha(colors.backgroundSoft, 0.62), at: 0 }, { color: withAlpha(colors.background, 0.55), at: 1 }]}
      />
      <Fill angle={180} stops={[{ color: withAlpha(colors.highlight, light ? 0.6 : 0.1), at: 0 }, { color: withAlpha(colors.highlight, 0), at: 0.5 }]} />
      {children}
    </View>
  );
}
