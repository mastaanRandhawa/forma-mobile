import { THEMES, ACCENTS } from "./themes";

/* Customization catalog (coins → cosmetics), ported from the website. */
export type CustomizationSlot =
  | "theme" | "accent" | "effect" | "avatar" | "chatTheme" | "frame" | "title" | "badge"
  | "colorMode" | "font";

export type CustomizationRarity = "common" | "rare" | "epic" | "legendary";

export type CustomizationItem = {
  id: string;
  slot: CustomizationSlot;
  /** tab grouping on the store */
  group: "Themes" | "Accents" | "Effects" | "Kai" | "Chat" | "Profile" | "Appearance" | "Font";
  name: string;
  detail: string;
  price: number;
  rarity: CustomizationRarity;
  /** gradient or colour for the preview chip */
  swatch?: string;
  /** lucide icon name for frames / titles / badges / effects */
  glyph?: string;
};

const themeItems: CustomizationItem[] = THEMES.map((t) => ({
  id: t.id,
  slot: "theme" as const,
  group: "Themes" as const,
  name: t.name,
  detail: t.blurb,
  price: 0,
  rarity: "common",
  swatch: t.swatch,
}));

const accentItems: CustomizationItem[] = ACCENTS.map((a) => ({
  id: a.id,
  slot: "accent" as const,
  group: "Accents" as const,
  name: a.name,
  detail: "recolours buttons, links, rings and glyphs — works in light and dark",
  price: 0,
  rarity: "common",
  swatch: a.color,
}));

const effectItems: CustomizationItem[] = [
  { id: "fx-auto", slot: "effect", group: "Effects", name: "Match theme", detail: "use whatever ambience the theme ships with", price: 0, rarity: "common", glyph: "Wand2" },
  { id: "fx-none", slot: "effect", group: "Effects", name: "Clean", detail: "no ambient motion behind the UI", price: 0, rarity: "common", glyph: "Minus" },
  { id: "fx-glow", slot: "effect", group: "Effects", name: "Accent bloom", detail: "a soft breathing halo in the accent colour", price: 140, rarity: "rare", glyph: "Sun" },
  { id: "fx-particles", slot: "effect", group: "Effects", name: "Drifting particles", detail: "slow motes of light float across the ground", price: 220, rarity: "rare", glyph: "Sparkles" },
  { id: "fx-aurora", slot: "effect", group: "Effects", name: "Fast aurora", detail: "the background aurora moves noticeably quicker", price: 200, rarity: "rare", glyph: "Waves" },
  { id: "fx-grain", slot: "effect", group: "Effects", name: "Film grain", detail: "heavy analogue grain over everything", price: 160, rarity: "rare", glyph: "Grip" },
  { id: "fx-scanlines", slot: "effect", group: "Effects", name: "CRT scanlines", detail: "horizontal scanlines and a faint flicker", price: 260, rarity: "epic", glyph: "Monitor" },
];

const avatarItems: CustomizationItem[] = [
  { id: "l-signature", slot: "avatar", group: "Kai", name: "Signature", detail: "the original pink", price: 0, rarity: "common", swatch: "linear-gradient(135deg,#F06CB0,#7A174F)" },
  { id: "l-aurora", slot: "avatar", group: "Kai", name: "Aurora", detail: "pink into cyan", price: 150, rarity: "common", swatch: "linear-gradient(135deg,#D51A7A,#4D7CFF,#83E9F4)" },
  { id: "l-ember", slot: "avatar", group: "Kai", name: "Ember", detail: "coral and amber", price: 150, rarity: "common", swatch: "linear-gradient(135deg,#FF6B4A,#FFB661)" },
  { id: "l-frost", slot: "avatar", group: "Kai", name: "Frost", detail: "cool blue-white", price: 150, rarity: "common", swatch: "linear-gradient(135deg,#83E9F4,#4D7CFF)" },
  { id: "l-nebula", slot: "avatar", group: "Kai", name: "Nebula", detail: "violet and wine", price: 220, rarity: "rare", swatch: "linear-gradient(135deg,#7F60FF,#7A174F)" },
  { id: "l-jade", slot: "avatar", group: "Kai", name: "Jade", detail: "deep green glass", price: 220, rarity: "rare", swatch: "linear-gradient(135deg,#4FD6A6,#1C5C41)" },
  { id: "l-mono", slot: "avatar", group: "Kai", name: "Monochrome", detail: "graphite and chrome", price: 260, rarity: "rare", swatch: "linear-gradient(135deg,#E8E8EC,#4A4A50)" },
  { id: "l-gold", slot: "avatar", group: "Kai", name: "Midas", detail: "molten gold", price: 600, rarity: "epic", swatch: "linear-gradient(135deg,#F5C63C,#8A6A18)" },
  { id: "l-holo", slot: "avatar", group: "Kai", name: "Holographic", detail: "shifting spectrum foil", price: 900, rarity: "legendary", swatch: "linear-gradient(135deg,#FF6CB0,#7BE0FF,#B6FF5C,#9C7BFF)" },
];

const chatItems: CustomizationItem[] = [
  { id: "t-default", slot: "chatTheme", group: "Chat", name: "Default", detail: "soft frosted bubbles", price: 0, rarity: "common", swatch: "linear-gradient(135deg,#3A2233,#241019)" },
  { id: "t-minimal", slot: "chatTheme", group: "Chat", name: "Minimal", detail: "flat, borderless, tight", price: 100, rarity: "common", swatch: "linear-gradient(135deg,#1C1C1F,#111113)" },
  { id: "t-terminal", slot: "chatTheme", group: "Chat", name: "Terminal", detail: "mono type, green cursor", price: 120, rarity: "common", swatch: "linear-gradient(135deg,#0A160A,#3BFF7A)" },
  { id: "t-paper", slot: "chatTheme", group: "Chat", name: "Paper", detail: "warm off-white note cards", price: 160, rarity: "rare", swatch: "linear-gradient(135deg,#E9E3D6,#C7BEA8)" },
  { id: "t-bubblegum", slot: "chatTheme", group: "Chat", name: "Bubblegum", detail: "rounded, bright, playful", price: 160, rarity: "rare", swatch: "linear-gradient(135deg,#FF8AC4,#7BE0FF)" },
  { id: "t-ink", slot: "chatTheme", group: "Chat", name: "Ink", detail: "high-contrast black on cream", price: 200, rarity: "epic", swatch: "linear-gradient(135deg,#F4EEDF,#15130E)" },
];

const profileItems: CustomizationItem[] = [
  // frames
  { id: "fr-none", slot: "frame", group: "Profile", name: "No frame", detail: "plain avatar pebble", price: 0, rarity: "common", glyph: "Circle" },
  { id: "fr-ring", slot: "frame", group: "Profile", name: "Accent ring", detail: "a glowing ring in your accent colour", price: 120, rarity: "common", glyph: "CircleDot" },
  { id: "fr-laurel", slot: "frame", group: "Profile", name: "Laurel", detail: "for people who finish what they start", price: 300, rarity: "rare", glyph: "Award" },
  { id: "fr-flame", slot: "frame", group: "Profile", name: "Streak flame", detail: "animated flame border, unlocks the vibe", price: 350, rarity: "rare", glyph: "Flame" },
  { id: "fr-prism", slot: "frame", group: "Profile", name: "Prism", detail: "rotating spectrum edge", price: 700, rarity: "epic", glyph: "Aperture" },
  { id: "fr-crown", slot: "frame", group: "Profile", name: "Crown", detail: "gold crown notch. subtle. mostly.", price: 1200, rarity: "legendary", glyph: "Crown" },
  // titles
  { id: "ti-none", slot: "title", group: "Profile", name: "No title", detail: "just your name", price: 0, rarity: "common", glyph: "Minus" },
  { id: "ti-earlybird", slot: "title", group: "Profile", name: "“Early Bird”", detail: "shows under your name across the app", price: 150, rarity: "common", glyph: "Sunrise" },
  { id: "ti-ironwilled", slot: "title", group: "Profile", name: "“Iron-Willed”", detail: "shows under your name across the app", price: 150, rarity: "common", glyph: "Dumbbell" },
  { id: "ti-relentless", slot: "title", group: "Profile", name: "“Relentless”", detail: "shows under your name across the app", price: 250, rarity: "rare", glyph: "Zap" },
  { id: "ti-machine", slot: "title", group: "Profile", name: "“The Machine”", detail: "shows under your name across the app", price: 250, rarity: "rare", glyph: "Cpu" },
  { id: "ti-legend", slot: "title", group: "Profile", name: "“Gym Legend”", detail: "you know why", price: 800, rarity: "epic", glyph: "Trophy" },
  // badges
  { id: "bd-none", slot: "badge", group: "Profile", name: "No badge", detail: "no badge next to your name", price: 0, rarity: "common", glyph: "Minus" },
  { id: "bd-spark", slot: "badge", group: "Profile", name: "Spark badge", detail: "a small accent spark by your name", price: 100, rarity: "common", glyph: "Sparkle" },
  { id: "bd-bolt", slot: "badge", group: "Profile", name: "Bolt badge", detail: "a lightning mark by your name", price: 100, rarity: "common", glyph: "Zap" },
  { id: "bd-star", slot: "badge", group: "Profile", name: "Star badge", detail: "a filled star by your name", price: 200, rarity: "rare", glyph: "Star" },
  { id: "bd-diamond", slot: "badge", group: "Profile", name: "Diamond badge", detail: "a cut-gem mark by your name", price: 500, rarity: "epic", glyph: "Gem" },
];

const colorModeItems: CustomizationItem[] = [
  {
    id: "cm-system",
    slot: "colorMode",
    group: "Appearance",
    name: "Follow system",
    detail: "matches your OS light/dark preference automatically",
    price: 0,
    rarity: "common",
    glyph: "Monitor",
  },
  {
    id: "cm-dark",
    slot: "colorMode",
    group: "Appearance",
    name: "Always dark",
    detail: "full dark mode regardless of OS setting",
    price: 0,
    rarity: "common",
    glyph: "Moon",
  },
  {
    id: "cm-light",
    slot: "colorMode",
    group: "Appearance",
    name: "Always light",
    detail: "bright surface mode — your theme's colours carry over",
    price: 0,
    rarity: "common",
    glyph: "Sun",
  },
];

const fontItems: CustomizationItem[] = [
  {
    id: "fn-system",
    slot: "font",
    group: "Font",
    name: "System default",
    detail: "the OS system sans-serif, clean and familiar",
    price: 0,
    rarity: "common",
    glyph: "Type",
  },
  {
    id: "fn-mono",
    slot: "font",
    group: "Font",
    name: "Monospace",
    detail: "all UI text in monospace — terminal energy",
    price: 80,
    rarity: "rare",
    glyph: "Terminal",
  },
  {
    id: "fn-rounded",
    slot: "font",
    group: "Font",
    name: "Rounded",
    detail: "Nunito — soft rounded letterforms, warm and approachable",
    price: 120,
    rarity: "rare",
    glyph: "Circle",
  },
  {
    id: "fn-serif",
    slot: "font",
    group: "Font",
    name: "Serif",
    detail: "DM Serif Display — editorial, bold, confident headings",
    price: 140,
    rarity: "rare",
    glyph: "BookOpen",
  },
];

export const customizationItems: CustomizationItem[] = [
  ...themeItems,
  ...accentItems,
  ...effectItems,
  ...avatarItems,
  ...chatItems,
  ...profileItems,
  ...colorModeItems,
  ...fontItems,
];
