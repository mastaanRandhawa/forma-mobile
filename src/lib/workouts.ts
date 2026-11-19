import { api } from "@/api/client";
import type { Workout, WorkoutInput, WorkoutSession } from "@/api/types";
import { templateDurationMin, type TemplateExercise, type WorkoutTemplate } from "./workout-templates";
import { KG_TO_LB, LB_TO_KG } from "./profile-options";

export type Units = "metric" | "imperial";

/** UI weight ⇄ stored kg. */
export const toKg = (v: number, u: Units) => (u === "metric" ? v : Math.round(v * LB_TO_KG * 100) / 100);
export const fromKg = (kg: number, u: Units) => (u === "metric" ? Math.round(kg * 10) / 10 : Math.round(kg * KG_TO_LB * 10) / 10);
export const unitLabel = (u: Units) => (u === "metric" ? "kg" : "lb");

export const repRange = (min: number | null, max: number | null) =>
  min && max && min !== max ? `${min}–${max}` : String(min ?? max ?? "");

export interface TemplateRow {
  id: string;
  name: string;
  description: string;
  targetMuscles: string[];
  exerciseCount: number;
  durationMin: number;
  editable: boolean;
  origin: "api" | "preset";
  exercises: TemplateExercise[];
  _api?: Workout;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Resolve a preset exercise name to a backend exercise id (exact → contains → first hit). */
async function resolveExerciseId(name: string): Promise<string | null> {
  try {
    const found = await api.library.exercises({ q: name, take: 12 });
    if (!found.items.length) return null;
    const key = normName(name);
    const exact = found.items.find((e) => normName(e.name) === key);
    if (exact) return exact.id;
    const contains = found.items.find((e) => normName(e.name).includes(key) || key.includes(normName(e.name)));
    return (contains ?? found.items[0]).id;
  } catch {
    return null;
  }
}

// The API has no RPE / warm-up fields on a workout exercise, so they ride in
// the notes as "cue · RPE 8 · warm-up set" and are parsed back on load.
const RPE_RE = /(?:^|\s·\s)RPE (\d+(?:\.\d)?)/;
const WARM_RE = /(?:^|\s·\s)warm-up set/;
export function encodeNotes(e: Pick<TemplateExercise, "note" | "rpe" | "warmup">): string | undefined {
  const parts = [e.note?.trim() || null, e.rpe != null ? `RPE ${e.rpe}` : null, e.warmup ? "warm-up set" : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}
export function decodeNotes(notes: string | null | undefined): Pick<TemplateExercise, "note" | "rpe" | "warmup"> {
  if (!notes) return {};
  const rpe = notes.match(RPE_RE);
  const warmup = WARM_RE.test(notes);
  const note = notes.replace(RPE_RE, "").replace(WARM_RE, "").replace(/^\s·\s|\s·\s$/g, "").trim();
  return { note: note || undefined, rpe: rpe ? Number(rpe[1]) : undefined, warmup: warmup || undefined };
}

/** Superset groups must be contiguous runs of 2+; renumber 1, 2, 3… in order. */
export function normalizeSupersets<T extends { supersetGroup?: number | null }>(list: T[]): T[] {
  const out = list.map((e) => ({ ...e }));
  for (let i = 0; i < out.length; i++) {
    const g = out[i].supersetGroup;
    if (g == null) continue;
    const linked = (i > 0 && out[i - 1].supersetGroup === g) || (i < out.length - 1 && out[i + 1].supersetGroup === g);
    if (!linked) out[i].supersetGroup = undefined;
  }
  let next = 0;
  let prevOriginal: number | null | undefined;
  for (const e of out) {
    const g = e.supersetGroup;
    if (g == null) {
      prevOriginal = undefined;
      continue;
    }
    if (g !== prevOriginal) next++;
    prevOriginal = g;
    e.supersetGroup = next;
  }
  return out;
}

async function toWorkoutExercises(exercises: TemplateExercise[]) {
  const out: NonNullable<WorkoutInput["exercises"]> = [];
  const missing: string[] = [];
  let order = 0;
  for (const e of normalizeSupersets(exercises)) {
    const id = e.exerciseId ?? (await resolveExerciseId(e.name));
    if (!id) {
      missing.push(e.name);
      continue;
    }
    out.push({
      exerciseId: id,
      order: order++,
      targetSets: Math.max(1, e.sets),
      targetRepsMin: e.repsMin,
      targetRepsMax: e.repsMax,
      targetRestSec: e.restSec,
      notes: encodeNotes(e),
      supersetGroup: e.supersetGroup ?? null,
      supersetType: e.supersetGroup != null ? "superset" : "straight",
    });
  }
  if (!out.length && exercises.length) throw new Error("None of these exercises were found in the library.");
  return out;
}

export function workoutToExercises(w: Workout): TemplateExercise[] {
  return [...w.exercises].sort((a, b) => a.order - b.order).map((we) => ({
    name: we.exercise.name,
    exerciseId: we.exerciseId,
    sets: we.targetSets,
    repsMin: we.targetRepsMin ?? 8,
    repsMax: we.targetRepsMax ?? we.targetRepsMin ?? 12,
    restSec: we.targetRestSec ?? 90,
    ...decodeNotes(we.notes),
    supersetGroup: we.supersetGroup ?? undefined,
  }));
}

export async function renameTemplate(id: string, name: string): Promise<TemplateRow> {
  return workoutToRow(await api.workouts.update(id, { name }));
}

export function workoutToRow(w: Workout): TemplateRow {
  const exercises = workoutToExercises(w);
  return {
    id: w.id,
    name: w.name,
    description: w.notes ?? "",
    targetMuscles: w.targetMuscleKeys,
    exerciseCount: w.exercises.length,
    durationMin: w.estimatedDurationMin ?? templateDurationMin(exercises),
    editable: true,
    origin: "api",
    exercises,
    _api: w,
  };
}

export function presetToRow(t: WorkoutTemplate): TemplateRow {
  return { id: t.id, name: t.name, description: t.description, targetMuscles: t.targetMuscles, exerciseCount: t.exercises.length, durationMin: t.durationMin, editable: false, origin: "preset", exercises: t.exercises };
}

export interface TemplateDraft {
  name: string;
  description?: string;
  targetMuscles?: string[];
  exercises: TemplateExercise[];
}

export async function createTemplate(d: TemplateDraft): Promise<TemplateRow> {
  const w = await api.workouts.create({
    name: d.name,
    source: "manual",
    isTemplate: true,
    targetMuscleKeys: d.targetMuscles ?? [],
    estimatedDurationMin: templateDurationMin(d.exercises),
    notes: d.description,
    exercises: await toWorkoutExercises(d.exercises),
  });
  return workoutToRow(w);
}

export async function updateTemplate(id: string, d: TemplateDraft): Promise<TemplateRow> {
  const w = await api.workouts.update(id, {
    name: d.name,
    targetMuscleKeys: d.targetMuscles ?? [],
    estimatedDurationMin: templateDurationMin(d.exercises),
    notes: d.description,
    exercises: await toWorkoutExercises(d.exercises),
  });
  return workoutToRow(w);
}

export const deleteTemplate = (id: string) => api.workouts.remove(id);

export async function duplicateTemplate(row: TemplateRow): Promise<TemplateRow> {
  if (row.origin === "preset") return createTemplate({ name: `${row.name} (my copy)`, description: row.description, targetMuscles: row.targetMuscles, exercises: row.exercises });
  return workoutToRow(await api.workouts.duplicate(row.id, { asTemplate: true }));
}

/** Start a server session from a template row or preset; presets are saved as a one-off workout first. */
export async function startFromRow(row: TemplateRow): Promise<WorkoutSession> {
  if (row._api) return api.sessions.start({ workoutId: row._api.id });
  const w = await api.workouts.create({
    name: row.name,
    source: "template",
    isTemplate: false,
    targetMuscleKeys: row.targetMuscles,
    estimatedDurationMin: row.durationMin,
    exercises: await toWorkoutExercises(row.exercises),
  });
  return api.sessions.start({ workoutId: w.id });
}

export const startQuick = () => api.sessions.start({ name: "Quick workout" });

/** Seed a new session from a finished one ("repeat this workout"). */
export async function startRepeat(s: WorkoutSession): Promise<WorkoutSession> {
  if (s.workoutId) return api.sessions.start({ workoutId: s.workoutId });
  const session = await api.sessions.start({ name: s.name });
  for (const p of s.performances) await api.sessions.addPerformance(session.id, p.exerciseId, p.order).catch(() => {});
  return api.sessions.get(session.id);
}

export async function saveSessionAsTemplate(s: WorkoutSession): Promise<TemplateRow> {
  const exercises: TemplateExercise[] = s.performances.map((p) => {
    const working = p.sets.filter((x) => !x.isWarmup);
    const reps = working.map((x) => x.reps).filter((r): r is number => r != null);
    return {
      name: p.exercise.name,
      sets: Math.max(1, working.length),
      repsMin: reps.length ? Math.min(...reps) : 8,
      repsMax: reps.length ? Math.max(...reps) : 12,
      restSec: 90,
      supersetGroup: p.supersetGroup ?? undefined,
    };
  });
  return createTemplate({ name: s.name, description: `Saved from ${new Date(s.startedAt).toLocaleDateString()}`, exercises });
}

export const fmtDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
};
export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
