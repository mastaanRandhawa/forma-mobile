/**
 * Mini-games: catalogue and device-local best scores. Scores never leave the
 * device — the games are a break between sets, not part of progression.
 */
import { useCallback, useEffect, useState } from "react";
import type { Ionicons } from "@expo/vector-icons";
import { readJSON, writeJSON } from "./storage";

export type GameId = "plates" | "reflex" | "muscles";

export interface GameInfo {
  id: GameId;
  title: string;
  blurb: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** how a best score reads, e.g. "12 bars" */
  format: (v: number) => string;
  /** true when a lower score is better (reaction time) */
  lowerIsBetter?: boolean;
}

export const GAMES: GameInfo[] = [
  { id: "plates", title: "Plate Rush", blurb: "Load the bar to the target weight. As many as you can in 60 seconds.", icon: "barbell-outline", format: (v) => `${v} ${v === 1 ? "bar" : "bars"}` },
  { id: "reflex", title: "Reflex", blurb: "Tap the moment the light turns green. Five rounds, average wins.", icon: "flash-outline", format: (v) => `${v} ms`, lowerIsBetter: true },
  { id: "muscles", title: "Muscle Match", blurb: "Name the main muscle each exercise works. Ten questions.", icon: "body-outline", format: (v) => `${v}/10` },
];

export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameInfo>;

type Bests = Partial<Record<GameId, number>>;
const KEY = "forma.games.bests";

/** Best scores, plus `submit` which records a score and says whether it beat the old best. */
export function useGameBests() {
  const [bests, setBests] = useState<Bests>({});
  useEffect(() => {
    let alive = true;
    void readJSON<Bests>(KEY, {}).then((b) => alive && setBests(b));
    return () => {
      alive = false;
    };
  }, []);

  const submit = useCallback(async (id: GameId, score: number): Promise<boolean> => {
    const cur = await readJSON<Bests>(KEY, {});
    const old = cur[id];
    const better = old == null || (GAME_MAP[id].lowerIsBetter ? score < old : score > old);
    if (better) {
      const next = { ...cur, [id]: score };
      writeJSON(KEY, next);
      setBests(next);
    }
    return better;
  }, []);

  return { bests, submit };
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
