/**
 * Small colour toolkit: parsing, OKLCH → sRGB (the web's Kai looks are authored
 * in oklch), mixing, WCAG contrast, and "make this accent readable on that
 * ground" helpers used by the theme engine.
 */

export type RGBA = [number, number, number, number];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const to255 = (v: number) => Math.round(clamp(v) * 255);

export function parseColor(input: string): RGBA {
  const s = input.trim().toLowerCase();
  if (s === "transparent") return [0, 0, 0, 0];
  if (s.startsWith("#")) {
    const h = s.slice(1);
    const full = h.length <= 4 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full.slice(0, 6), 16);
    const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  const ok = s.match(/oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/);
  if (ok) return oklchToRgba(Number(ok[1]) / 100, Number(ok[2]), Number(ok[3]));
  return [0, 0, 0, 1];
}

export function oklchToRgba(L: number, C: number, hDeg: number): RGBA {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const enc = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055);
  return [to255(enc(lin[0])), to255(enc(lin[1])), to255(enc(lin[2])), 1];
}

export const toHex = ([r, g, b]: RGBA) => "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
export const toCss = ([r, g, b, a]: RGBA) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 1000) / 1000})`;

/** Any CSS colour → a string react-native-svg / RN style props understand. */
export const normalizeColor = (c: string) => (/^oklch/i.test(c.trim()) ? toHex(parseColor(c)) : c);

export function withAlpha(c: string, alpha: number): string {
  const [r, g, b] = parseColor(c);
  return toCss([r, g, b, alpha]);
}

export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  return toCss([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t, x[3] + (y[3] - x[3]) * t]);
}

export function luminance(c: string): number {
  const [r, g, b] = parseColor(c);
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white ink — whichever reads better on `bg`. */
export function inkOn(bg: string): string {
  return contrast(bg, "#ffffff") >= contrast(bg, "#1a1218") ? "#ffffff" : "#1a1218";
}

/**
 * Nudge an accent until it reaches `min` contrast against `ground`, moving
 * toward white on dark grounds and toward black on light ones. Keeps hue, so a
 * user-picked accent adapts to the mode instead of being swapped out.
 */
export function ensureContrast(accent: string, ground: string, min = 3): string {
  const toward = luminance(ground) < 0.4 ? "#ffffff" : "#000000";
  let c = accent;
  for (let i = 0; i < 24 && contrast(c, ground) < min; i++) c = mix(c, toward, 0.08);
  return toHex(parseColor(c));
}
