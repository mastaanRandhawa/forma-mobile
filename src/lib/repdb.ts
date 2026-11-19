/**
 * RepDB (repdb.co) exercise data — identical logic to the website's
 * `lib/repdb.ts`. Images are RepDB's flat WebP illustrations, hot-linked from
 * exercise-dataset.com. The API's seeded exercises carry no image URLs, so —
 * exactly like the web app — an exercise's picture is found by matching its
 * *name* against the bundled catalog (with the same hand-checked aliases).
 *
 * `repdb.index.json` is the slim name→image index (≈80 kB); the full catalog
 * (descriptions, instructions, tips) is required lazily by the library/detail.
 */
import index from "@/data/repdb.index.json";

export const REPDB_ATTRIBUTION = "Exercise data by RepDB";
export const REPDB_URL = "https://repdb.co";
export const REPDB_IMAGE_BASE = "https://exercise-dataset.com/images/flat/";

export interface RepDbCatalogEntry {
  id: string;
  name: string;
  primary: string[];
  secondary: string[];
  equipment: string;
  bodyPart: string;
  difficulty: string;
  mechanic: string | null;
  force: string | null;
  discipline: string | null;
  unilateral: boolean;
  bodyweight: boolean;
  met: number | null;
  goals: string[];
  description: string | null;
  instructions: string[];
  tips: string[];
  imgStart: string | null;
  imgEnd: string | null;
}

interface IndexEntry {
  id: string;
  name: string;
  imgStart: string | null;
  imgEnd: string | null;
}
const INDEX = (index as { exercises: IndexEntry[] }).exercises;

export const repdbImage = (file: string | null | undefined): string | null => (file ? REPDB_IMAGE_BASE + file : null);

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|with|and)\b/g, " ").replace(/\s+/g, " ").trim();

/** Hand-checked aliases where the app's exercise name ≠ RepDB's name. */
const ALIASES: Record<string, string> = {
  "barbell bench press": "bench-press",
  "incline dumbbell press": "incline-db-press",
  "overhead press": "dumbbell-shoulder-press",
  "triceps rope pushdown": "tricep-pushdown",
  "conventional deadlift": "deadlift",
  "dumbbell row": "bent-over-db-row",
  "dumbbell curl": "bicep-curl",
  "barbell row": "barbell-row",
  "lat pulldown": "lat-pulldown",
  "face pull": "face-pull",
  "hammer curl": "dumbbell-hammer-curl",
  "leg press": "leg-press",
  "walking lunge": "walking-lunge",
  "leg curl": "leg-curl",
  "standing calf raise": "standing-calf-raise",
};

const byId = new Map(INDEX.map((e) => [e.id, e]));
const byName = new Map(INDEX.map((e) => [norm(e.name), e]));

/** Thumbnail URL for a free-text exercise name, or null if no confident match. */
export function repdbThumb(name: string): string | null {
  const key = norm(name);
  const hit = (ALIASES[key] && byId.get(ALIASES[key])) || byName.get(key);
  return hit ? repdbImage(hit.imgStart ?? hit.imgEnd) : null;
}

/** The full catalog (≈640 kB) — loaded on first use so it stays out of startup. */
let catalog: RepDbCatalogEntry[] | null = null;
export function getRepdbCatalog(): RepDbCatalogEntry[] {
  if (!catalog) catalog = (require("@/data/repdb.catalog.json") as { exercises: RepDbCatalogEntry[] }).exercises;
  return catalog;
}

/** Same lookup the website's ActiveWorkout/Builder use: exact name, then containment. */
export function repdbEntryFor(name: string): RepDbCatalogEntry | null {
  const key = norm(name);
  if (!key) return null;
  const cat = getRepdbCatalog();
  return cat.find((e) => norm(e.name) === key) ?? cat.find((e) => norm(e.name).includes(key) || key.includes(norm(e.name))) ?? null;
}

/** Best image for an exercise: its own API url when it has one, else the RepDB match by name. */
export function exerciseImage(ex: { name: string; imageStartUrl?: string | null; imageEndUrl?: string | null }): string | null {
  return ex.imageStartUrl ?? ex.imageEndUrl ?? repdbThumb(ex.name);
}
