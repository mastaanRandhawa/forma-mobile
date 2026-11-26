/**
 * Typo-tolerant matching for the on-device exercise catalogue. A word in the
 * query matches a word in the exercise when it is a substring, a prefix typed
 * so far, or within a small edit distance (a swapped pair of letters counts as
 * one edit). Every query word must match somewhere. Lower scores are better.
 */

/** Damerau–Levenshtein (optimal string alignment) distance, capped for speed. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, (prev2[j - 2] ?? Infinity) + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev2.length = 0;
    prev2.push(...prev);
    prev = cur;
  }
  return prev[b.length];
}

/** How many typos a query word of this length may have. */
const allowance = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Score of one query word against a text's words: 0 exact/substring, 1–2 typos, null no match. */
function wordScore(q: string, textWords: string[], text: string): number | null {
  if (text.includes(q)) return 0;
  let best: number | null = null;
  const max = allowance(q.length);
  for (const w of textWords) {
    // someone still typing: "benc" should match "bench"
    if (w.startsWith(q)) return 0;
    const d = editDistance(q, w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1))), max);
    const full = editDistance(q, w, max);
    const m = Math.min(d, full);
    if (m <= max && (best === null || m < best)) best = m;
  }
  return best;
}

/** Total score of a query against a text, or null when any query word has no match. */
export function fuzzyScore(query: string, text: string): number | null {
  const qs = words(query);
  if (!qs.length) return 0;
  const lower = text.toLowerCase();
  const tw = words(text);
  let total = 0;
  for (const q of qs) {
    const s = wordScore(q, tw, lower);
    if (s === null) return null;
    total += s;
  }
  return total;
}

/**
 * Filter + rank. `text` is everything searchable (name, equipment, muscles);
 * `name`, when given, ranks first: an item whose name matches beats one that only
 * matches through its other fields, and among equal scores the shorter name is the
 * closer match ("Dumbbell Bench Press" before "Close-Grip Dumbbell Bench Press").
 */
export function fuzzyFilter<T>(items: readonly T[], query: string, text: (item: T) => string, name?: (item: T) => string): T[] {
  if (!query.trim()) return [...items];
  const scored: { item: T; score: number; len: number; i: number }[] = [];
  items.forEach((item, i) => {
    const n = name ? name(item) : text(item);
    const byName = fuzzyScore(query, n);
    const score = byName ?? (name ? fuzzyScore(query, text(item)) : null);
    if (score === null) return;
    scored.push({ item, score: byName === null ? score + 10 : score, len: n.length, i });
  });
  return scored.sort((a, b) => a.score - b.score || a.len - b.len || a.i - b.i).map((s) => s.item);
}
