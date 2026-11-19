/**
 * Forma design tokens — ported 1:1 from the website's src/styles/tokens.css.
 * Single source of truth for colour, radius, type and depth. Don't hardcode
 * these values in components.
 */
import type { TextStyle, ViewStyle } from "react-native";

export type ColorKey =
  | "background" | "backgroundDeep" | "backgroundSoft" | "wine" | "aubergine"
  | "surface" | "surfaceGlass" | "surfaceRaised" | "surfaceRecessed" | "surfaceOpaque" | "surfaceFloat"
  | "textPrimary" | "textSecondary" | "textTertiary" | "textDark"
  | "pinkDust" | "pinkSoft" | "pinkHot"
  | "pink" | "purple" | "mauve" | "blue" | "cyan" | "orange" | "coral" | "amber" | "lime" | "jade"
  | "btnWhite" | "btnWhiteInk" | "onColor"
  | "good" | "steady" | "caution" | "rest"
  | "lineSoft" | "lineHighlight" | "specular" | "danger"
  | "onAccent" | "hairline" | "highlight" | "shade" | "shadowTint";

export const colors: Record<ColorKey, string> = {
  // atmosphere / ground
  background: "#170D17",
  backgroundDeep: "#100A11",
  backgroundSoft: "#34132D",
  wine: "#7A174F",
  aubergine: "#34132D",

  // surfaces (translucent)
  surface: "rgba(255, 244, 250, 0.10)",
  surfaceGlass: "rgba(255, 244, 250, 0.13)",
  surfaceRaised: "rgba(255, 239, 248, 0.16)",
  surfaceRecessed: "rgba(48, 16, 40, 0.42)",
  surfaceOpaque: "#24151F",
  surfaceFloat: "rgba(255, 241, 248, 0.22)",

  // text
  textPrimary: "rgba(255, 249, 252, 0.96)",
  textSecondary: "rgba(255, 241, 248, 0.66)",
  textTertiary: "rgba(255, 241, 248, 0.42)",
  textDark: "#23131D",

  // brand family
  pinkDust: "#D9A9C8",
  pinkSoft: "#E8A5C5",
  pinkHot: "#D51A7A",

  // accents
  pink: "#D51A7A",
  purple: "#7A174F",
  mauve: "#B36596",
  blue: "#4D7CFF",
  cyan: "#83E9F4",
  orange: "#FF9C63",
  coral: "#FF6B4A",
  amber: "#FFB661",
  lime: "#D8FF63",
  jade: "#4FD6A6",

  // controls
  btnWhite: "#FBF3F6",
  btnWhiteInk: "#23131D",
  onColor: "rgba(255, 250, 248, 0.96)",

  // status (never encode meaning by colour alone)
  good: "#D8FF63",
  steady: "#83E9F4",
  caution: "#FF9C63",
  rest: "#B36596",

  // lines
  lineSoft: "rgba(255, 255, 255, 0.09)",
  lineHighlight: "rgba(255, 255, 255, 0.20)",
  specular: "rgba(255, 255, 255, 0.34)",

  danger: "#FF6B4A",

  // derived: readable ink on an accent fill, surface hairline, top highlight,
  // recessed shade and the contact-shadow tint (all switch with light/dark)
  onAccent: "#FFFFFF",
  hairline: "rgba(255, 255, 255, 0.06)",
  highlight: "rgba(255, 255, 255, 0.16)",
  shade: "rgba(30, 6, 24, 0.5)",
  shadowTint: "#400F30",
};

/** Live ambient state the Atmosphere paints from (set by the theme engine). */
export const ambient: { mode: "dark" | "light"; atmosphere: string; aurora: [string, string, string]; fill: string } = {
  mode: "dark",
  atmosphere: "",
  aurora: ["rgba(213,26,122,0.28)", "rgba(122,23,79,0.34)", "rgba(179,101,150,0.18)"],
  fill: "linear-gradient(150deg,#FF7E58 0%,#E64A2B 100%)",
};

export type Tone = "pink" | "cyan" | "lime" | "amber" | "mauve" | "violet";

/** Live view of the tone → colour map (reads the current palette each time). */
export const toneColor: Record<Tone, string> = {
  get pink() { return colors.pink; },
  get cyan() { return colors.cyan; },
  get lime() { return colors.lime; },
  get amber() { return colors.amber; },
  get mauve() { return colors.mauve; },
  get violet() { return colors.blue; },
};

export const radius: Record<"small" | "medium" | "large" | "xl" | "shell" | "pill", number> = {
  small: 18,
  medium: 24,
  large: 32,
  xl: 40,
  shell: 48,
  pill: 999,
};

/**
 * Spacing scale (4pt grid). `page` is the one horizontal page margin every
 * screen uses; `card` are the three card paddings (see `Card` variants).
 */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, huge: 40, page: 20 } as const;
export const cardPad = { compact: 16, default: 20, hero: 24 } as const;

/** One icon scale (Ionicons, outline by default; filled only for an active/selected state). */
export const iconSize = { sm: 16, md: 20, lg: 24 } as const;

/** Minimum interactive target, in points. */
export const HIT = 44;

/** Font families loaded in the root layout (Urbanist for text, Space Grotesk for numbers). */
export const fonts = {
  light: "Urbanist_300Light",
  regular: "Urbanist_400Regular",
  medium: "Urbanist_500Medium",
  semibold: "Urbanist_600SemiBold",
  bold: "Urbanist_700Bold",
  num: "SpaceGrotesk_500Medium",
  numRegular: "SpaceGrotesk_400Regular",
  numBold: "SpaceGrotesk_700Bold",
} as const;

export const type = {
  display: { fontFamily: fonts.light, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: fonts.light, fontSize: 28, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 26 },
  /** section header on a screen */
  section: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 24, letterSpacing: -0.1 },
  /** title inside a card */
  cardTitle: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
  bodyLg: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  meta: { fontFamily: fonts.semibold, fontSize: 12.5, lineHeight: 17, letterSpacing: 0.15 },
  numeral: { fontFamily: fonts.num, fontSize: 28, lineHeight: 28, letterSpacing: -0.6 },
} satisfies Record<string, TextStyle>;

/**
 * Contact shadows. Dark mode: soft wine-tinted depth. Light mode: neutral,
 * compact shadows — depth, not glow — as in the website's light-mode layer.
 * Getters so every read reflects the current mode.
 */
const light = () => ambient.mode === "light";
export const shadow = {
  get soft(): ViewStyle {
    return light()
      ? { shadowColor: "#1E1423", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 3 }
      : { shadowColor: colors.shadowTint, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.28, shadowRadius: 28, elevation: 8 };
  },
  get raised(): ViewStyle {
    return light()
      ? { shadowColor: "#1E1423", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 4 }
      : { shadowColor: colors.shadowTint, shadowOffset: { width: 6, height: 12 }, shadowOpacity: 0.34, shadowRadius: 24, elevation: 12 };
  },
  get float(): ViewStyle {
    return light()
      ? { shadowColor: "#1E1423", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 24, elevation: 8 }
      : { shadowColor: "#1C0616", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 14 };
  },
  get glowHero(): ViewStyle {
    return { shadowColor: colors.pink, shadowOffset: { width: 0, height: 0 }, shadowOpacity: light() ? 0.18 : 0.55, shadowRadius: 40, elevation: 0 };
  },
};

const VAR_TO_KEY: Record<string, ColorKey> = {
  "--background": "background",
  "--background-deep": "backgroundDeep",
  "--background-soft": "backgroundSoft",
  "--surface": "surface",
  "--surface-glass": "surfaceGlass",
  "--surface-raised": "surfaceRaised",
  "--surface-recessed": "surfaceRecessed",
  "--surface-opaque": "surfaceOpaque",
  "--surface-float": "surfaceFloat",
  "--text-primary": "textPrimary",
  "--text-secondary": "textSecondary",
  "--text-tertiary": "textTertiary",
  "--accent-pink": "pink",
  "--accent-purple": "purple",
  "--accent-mauve": "mauve",
  "--accent-blue": "blue",
  "--accent-cyan": "cyan",
  "--accent-orange": "orange",
  "--accent-coral": "coral",
  "--accent-amber": "amber",
  "--accent-lime": "lime",
  "--accent-jade": "jade",
  "--line-soft": "lineSoft",
  "--line-highlight": "lineHighlight",
  "--specular": "specular",
  "--btn-white": "btnWhite",
  "--btn-white-ink": "btnWhiteInk",
  "--fill-on-color": "onColor",
};

/** Apply a theme's CSS-var set (from themes.ts) onto the live token objects. */
export function applyThemeVars(vars: Record<string, string>, mode?: "dark" | "light") {
  for (const [k, v] of Object.entries(vars)) {
    const key = VAR_TO_KEY[k];
    if (key) colors[key] = v;
  }
  if (vars["--accent-pink"]) colors.pinkHot = vars["--accent-pink"];
  if (vars["--accent-coral"]) colors.danger = vars["--accent-coral"];
  if (vars["--radius-small"]) radius.small = parseInt(vars["--radius-small"], 10);
  if (vars["--radius-medium"]) radius.medium = parseInt(vars["--radius-medium"], 10);
  if (vars["--radius-large"]) radius.large = parseInt(vars["--radius-large"], 10);
  if (vars["--radius-xl"]) radius.xl = parseInt(vars["--radius-xl"], 10);
  if (vars["--radius-shell"]) radius.shell = parseInt(vars["--radius-shell"], 10);
  if (vars["--atmosphere-bg"]) ambient.atmosphere = vars["--atmosphere-bg"];
  if (vars["--aurora-1"]) ambient.aurora = [vars["--aurora-1"], vars["--aurora-2"] ?? vars["--aurora-1"], vars["--aurora-3"] ?? vars["--aurora-1"]];
  if (vars["--fill-coral"]) ambient.fill = vars["--fill-coral"];
  if (mode) {
    ambient.mode = mode;
    const dark = mode === "dark";
    colors.hairline = dark ? "rgba(255, 255, 255, 0.06)" : colors.lineSoft;
    colors.highlight = dark ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.8)";
    colors.shade = dark ? "rgba(30, 6, 24, 0.5)" : "rgba(41, 28, 45, 0.1)";
    colors.shadowTint = dark ? colors.wine : "#1E1423";
  }
}
