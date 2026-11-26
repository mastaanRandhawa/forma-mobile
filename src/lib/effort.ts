/**
 * Effort per set, on whichever scale you think in. The server only knows RPE
 * (1–10), so RIR ("reps in reserve") is stored as RPE = 10 - RIR and converted
 * back for display. RIR 0 means nothing left; RIR 3 means about three more reps.
 */
export type EffortScale = "rpe" | "rir";

/** RIR is only meaningful from 0 (all-out) to 5 (RPE 5 and easier is not tracked) */
export const RIR_MAX = 5;

export const toRir = (rpe: number) => Math.max(0, Math.round((10 - rpe) * 2) / 2);
export const fromRir = (rir: number) => Math.min(10, Math.max(5, 10 - rir));

/** Short label for a logged set, e.g. "RPE 8" or "2 RIR". */
export const fmtEffort = (rpe: number, scale: EffortScale) => (scale === "rir" ? `${toRir(rpe)} RIR` : `RPE ${rpe}`);
