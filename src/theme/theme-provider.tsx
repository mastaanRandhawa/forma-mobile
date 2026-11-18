import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/api/client";
import { colors, applyThemeVars } from "./tokens";
import { ACCENT_MAP, THEME_MAP, resolveColorMode, resolveThemeId, onLight, type ColorMode, type ThemeEffect } from "./themes";
import { customizationItems, type CustomizationItem, type CustomizationSlot } from "./catalog";

/**
 * Customization + live theme. Mirrors the website's CustomizationProvider:
 * owned ids + an `equipped` map per slot, hydrated from /customization and
 * cached locally. Equipping rewrites the live `colors` tokens; consumers call
 * `useTheme()` so they re-render with the new palette.
 */

const LS_KEY = "forma.customization.v1";

const DEFAULT_EQUIPPED: Record<CustomizationSlot, string> = {
  theme: "aurora-plum",
  accent: "ac-brand",
  effect: "fx-auto",
  avatar: "l-signature",
  chatTheme: "t-default",
  frame: "fr-none",
  title: "ti-none",
  badge: "bd-none",
  colorMode: "cm-system",
  font: "fn-system",
};

const defaultOwned = () => customizationItems.filter((i) => i.price === 0).map((i) => i.id);

interface Ctx {
  owned: string[];
  equipped: Record<CustomizationSlot, string>;
  balance: number;
  mode: ColorMode;
  effect: ThemeEffect;
  version: number;
  isOwned: (id: string) => boolean;
  isEquipped: (id: string, slot: CustomizationSlot) => boolean;
  buy: (item: CustomizationItem, autoEquip?: boolean) => Promise<boolean>;
  equip: (item: CustomizationItem) => Promise<void>;
  setSlot: (slot: CustomizationSlot, id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const ThemeCtx = createContext<Ctx | null>(null);

function resolveEffect(themeId: string, effectId: string): ThemeEffect {
  if (effectId === "fx-auto") return THEME_MAP[themeId]?.effect ?? "none";
  const map: Record<string, ThemeEffect> = {
    "fx-none": "none",
    "fx-particles": "particles",
    "fx-scanlines": "scanlines",
    "fx-grain": "grain-heavy",
    "fx-glow": "glow",
    "fx-aurora": "aurora-fast",
  };
  return map[effectId] ?? "none";
}

function paint(equipped: Record<CustomizationSlot, string>, system: ColorMode) {
  const theme = THEME_MAP[resolveThemeId(equipped.theme)];
  const mode = resolveColorMode(equipped.colorMode, system);
  applyThemeVars(mode === "light" ? theme.varsLight : theme.vars);
  const accent = ACCENT_MAP[equipped.accent];
  if (accent && accent.id !== "ac-brand") {
    const a = mode === "light" ? onLight(accent.color) : accent.color;
    applyThemeVars({ "--accent-pink": a, "--accent-coral": a });
  }
  return { mode, effect: resolveEffect(theme.id, equipped.effect) };
}

export function ThemeProvider({ children, authKey, reduceMotion }: { children: ReactNode; authKey?: string; reduceMotion?: boolean }) {
  const scheme = useColorScheme();
  const system: ColorMode = scheme === "light" ? "light" : "dark";
  const [owned, setOwned] = useState<string[]>(defaultOwned);
  const [equipped, setEquipped] = useState<Record<CustomizationSlot, string>>(DEFAULT_EQUIPPED);
  const [balance, setBalance] = useState(0);
  const [version, setVersion] = useState(0);

  const apply = useCallback(
    (o: string[], e: Record<CustomizationSlot, string>, bal?: number) => {
      const merged = Array.from(new Set([...o, ...defaultOwned()]));
      const eq = { ...DEFAULT_EQUIPPED, ...e } as Record<CustomizationSlot, string>;
      eq.theme = resolveThemeId(eq.theme);
      setOwned(merged);
      setEquipped(eq);
      if (typeof bal === "number") setBalance(bal);
      AsyncStorage.setItem(LS_KEY, JSON.stringify({ owned: merged, equipped: eq })).catch(() => {});
    },
    [],
  );

  // restore the cached selection so the first frame already wears the right theme
  useEffect(() => {
    AsyncStorage.getItem(LS_KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw) as { owned?: string[]; equipped?: Record<string, string> };
        apply(p.owned ?? [], (p.equipped ?? {}) as Record<CustomizationSlot, string>);
      })
      .catch(() => {});
  }, [apply]);

  const refresh = useCallback(async () => {
    try {
      const s = await api.customization.get();
      apply(s.owned, s.equipped as Record<CustomizationSlot, string>, s.balance);
    } catch {
      /* offline / signed out */
    }
  }, [apply]);

  useEffect(() => {
    if (authKey === "authed") void refresh();
  }, [authKey, refresh]);

  // repaint tokens whenever the selection or OS scheme changes
  const { mode, effect } = useMemo(() => paint(equipped, system), [equipped, system]);
  useEffect(() => setVersion((v) => v + 1), [equipped, system]);

  const setSlot = useCallback(
    async (slot: CustomizationSlot, id: string) => {
      setEquipped((cur) => ({ ...cur, [slot]: id }));
      try {
        const s = await api.customization.setSlot(slot, id);
        apply(s.owned, s.equipped as Record<CustomizationSlot, string>, s.balance);
      } catch {
        void refresh();
      }
    },
    [apply, refresh],
  );

  const equip = useCallback(
    async (item: CustomizationItem) => {
      if (!owned.includes(item.id)) return;
      setEquipped((cur) => ({ ...cur, [item.slot]: item.id }));
      try {
        const s = await api.customization.equip(item.id);
        apply(s.owned, s.equipped as Record<CustomizationSlot, string>, s.balance);
      } catch {
        void refresh();
      }
    },
    [owned, apply, refresh],
  );

  const buy = useCallback(
    async (item: CustomizationItem, autoEquip = false) => {
      if (owned.includes(item.id) || balance < item.price) return false;
      try {
        let s = await api.customization.buy(item.id);
        if (autoEquip) s = await api.customization.equip(item.id);
        apply(s.owned, s.equipped as Record<CustomizationSlot, string>, s.balance);
        return true;
      } catch {
        void refresh();
        return false;
      }
    },
    [owned, balance, apply, refresh],
  );

  const value = useMemo<Ctx>(
    () => ({
      owned,
      equipped,
      balance,
      mode,
      effect: reduceMotion ? "none" : effect,
      version,
      isOwned: (id) => owned.includes(id),
      isEquipped: (id, slot) => equipped[slot] === id,
      buy,
      equip,
      setSlot,
      refresh,
    }),
    [owned, equipped, balance, mode, effect, reduceMotion, version, buy, equip, setSlot, refresh],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useCustomization(): Ctx {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useCustomization must be used inside <ThemeProvider>");
  return v;
}

/** Subscribe a component to palette changes; returns the live token object. */
export function useTheme() {
  const { version, mode } = useCustomization();
  void version;
  return { colors, mode };
}

export function useEquippedItem(slot: CustomizationSlot): CustomizationItem | undefined {
  const { equipped } = useCustomization();
  return customizationItems.find((i) => i.id === equipped[slot]);
}
