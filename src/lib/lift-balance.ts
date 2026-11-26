/**
 * Lift ratios — how your main barbell lifts compare with each other.
 *
 * Each lift is expressed as a multiple of your bench press, using the best
 * estimated 1RM on record, and checked against a rough range that is common
 * for lifters with balanced strength. These ranges are a rule of thumb, not a
 * prescription: they ignore leverages, injuries and what you train for, and
 * they only compare barbell lifts so the numbers mean the same thing each time.
 */
import type { PersonalRecord } from "@/api/types";

export interface LiftDef {
  key: "bench" | "squat" | "deadlift" | "press" | "row";
  label: string;
  /** exact exercise names that count (barbell versions only) */
  match: RegExp;
  /** typical range as a multiple of bench press */
  lo: number;
  hi: number;
}

export const LIFTS: LiftDef[] = [
  { key: "bench", label: "Bench press", match: /^barbell bench press$/i, lo: 1, hi: 1 },
  { key: "squat", label: "Back squat", match: /^barbell back squat$/i, lo: 1.2, hi: 1.5 },
  { key: "deadlift", label: "Deadlift", match: /^(barbell|conventional) deadlift$/i, lo: 1.4, hi: 1.8 },
  { key: "press", label: "Overhead press", match: /^(seated )?barbell overhead press$/i, lo: 0.55, hi: 0.7 },
  { key: "row", label: "Barbell row", match: /^bent-over barbell row$/i, lo: 0.75, hi: 1 },
];

export interface LiftRatio {
  lift: LiftDef;
  e1rmKg: number;
  /** multiple of bench press, null for the bench itself */
  ratio: number | null;
  status: "below" | "within" | "above" | "anchor";
}

export interface BalanceReport {
  rows: LiftRatio[];
  /** the lift furthest below its range, or bench press when every other lift is above its range */
  weakest: LiftDef | null;
}

/** Best estimated 1RM (kg) per lift from the personal-record list. */
export function bestE1rm(prs: PersonalRecord[]): Partial<Record<LiftDef["key"], number>> {
  const out: Partial<Record<LiftDef["key"], number>> = {};
  for (const p of prs) {
    if (p.recordType !== "max_1rm_estimate" || !p.exercise) continue;
    const lift = LIFTS.find((l) => l.match.test(p.exercise!.name));
    if (lift && p.value > (out[lift.key] ?? 0)) out[lift.key] = p.value;
  }
  return out;
}

/** Needs a bench press and at least one other lift; otherwise there is nothing to compare. */
export function liftBalance(prs: PersonalRecord[]): BalanceReport | null {
  const best = bestE1rm(prs);
  const bench = best.bench;
  if (!bench) return null;
  const rows: LiftRatio[] = [];
  for (const lift of LIFTS) {
    const e = best[lift.key];
    if (!e) continue;
    if (lift.key === "bench") {
      rows.push({ lift, e1rmKg: e, ratio: null, status: "anchor" });
      continue;
    }
    const ratio = Math.round((e / bench) * 100) / 100;
    rows.push({ lift, e1rmKg: e, ratio, status: ratio < lift.lo ? "below" : ratio > lift.hi ? "above" : "within" });
  }
  const others = rows.filter((r) => r.status !== "anchor");
  if (!others.length) return null;
  const below = others.filter((r) => r.status === "below").sort((a, b) => a.ratio! / a.lift.lo - b.ratio! / b.lift.lo);
  const weakest = below[0]?.lift ?? (others.every((r) => r.status === "above") ? LIFTS[0] : null);
  return { rows, weakest };
}
