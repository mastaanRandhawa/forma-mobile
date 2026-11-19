/** Kai's short in-workout coaching lines — ported from the website (lib/session.ts). */
export type CueEvent =
  | "start"
  | "before-set"
  | "set-done"
  | "rest"
  | "rest-over"
  | "pr"
  | "deferred"
  | "resumed"
  | "substituted"
  | "exercise-done"
  | "almost-done"
  | "superset-next"
  | "finish";

export interface CueContext {
  exerciseName?: string;
  setsLeftInExercise?: number;
  exercisesLeft?: number;
  totalExercises?: number;
  heavierThanLast?: boolean;
  lighterThanLast?: boolean;
  restSeconds?: number;
  prDetail?: string;
}

const pick = (arr: string[], seed = Date.now()) => arr[Math.floor(seed / 1000) % arr.length];

/** A short, contextual line for Kai. Deterministic-ish so it doesn't flicker. */
export function trainerCue(event: CueEvent, ctx: CueContext = {}): string {
  switch (event) {
    case "start":
      return ctx.totalExercises
        ? pick([
            `Ready? ${ctx.totalExercises} exercises today. Let's move.`,
            `${ctx.totalExercises} on the board. First up: ${ctx.exerciseName ?? "let's go"}.`,
          ])
        : "Let's get to work.";
    case "before-set":
      if (ctx.heavierThanLast) return "Heavier than last time — brace hard and own it.";
      if (ctx.lighterThanLast) return "Lighter today. Move it fast and clean.";
      return pick(["Match last time. Controlled reps.", "You know this one. Tight and steady."]);
    case "set-done":
      if ((ctx.setsLeftInExercise ?? 0) <= 0) return "That's the exercise done. Nice work.";
      if ((ctx.setsLeftInExercise ?? 0) === 1) return "One set left. Make it count.";
      return pick([
        `Good set. ${ctx.setsLeftInExercise} to go.`,
        `Logged. ${ctx.setsLeftInExercise} more.`,
      ]);
    case "rest":
      return ctx.restSeconds && ctx.restSeconds >= 120
        ? "Big set — take the full rest. Breathe."
        : "Good set. Recover for the next one.";
    case "rest-over":
      return pick(["Time. Chalk up.", "Rest's up — next set."]);
    case "pr":
      return ctx.prDetail ? `That's a new best — ${ctx.prDetail}. Huge.` : "New personal record. Huge.";
    case "deferred":
      return ctx.exerciseName
        ? `No problem — we'll come back to ${ctx.exerciseName}. Moving on.`
        : "No problem. We'll circle back to that one.";
    case "resumed":
      return ctx.exerciseName ? `Back to ${ctx.exerciseName}. Pick up where we left off.` : "Back to it.";
    case "substituted":
      return ctx.exerciseName ? `Swapped in ${ctx.exerciseName}. Same target, keep the intent.` : "Swapped. Keep the intent.";
    case "exercise-done":
      return (ctx.exercisesLeft ?? 0) > 0
        ? pick([`Done. ${ctx.exercisesLeft} exercise${ctx.exercisesLeft === 1 ? "" : "s"} left.`, "Solid. Next one."])
        : "That's everything. Let's close it out.";
    case "almost-done":
      return "One exercise left. Finish strong.";
    case "superset-next":
      return ctx.exerciseName
        ? `No rest — straight into ${ctx.exerciseName}.`
        : "No rest — straight into the next move.";
    case "finish":
      return pick(["Great session.", "That's the work. Well done.", "Strong session — recover well."]);
  }
}

