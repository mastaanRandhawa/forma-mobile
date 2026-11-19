/**
 * Gradient engine.
 *
 * The website paints everything with layered CSS radial/linear gradients. React
 * Native has neither radial gradients nor multi-layer backgrounds, so this
 * renders the *same* gradient definitions with react-native-svg: true radial
 * ellipses, any number of stops, and CSS-accurate behaviour for `transparent`
 * (fade the neighbouring colour's alpha to 0 instead of through grey — the
 * source of the visible "bands"/fringes you get from naive two-colour fills).
 */
import { memo, useId, useMemo, useState } from "react";
import { Dimensions, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient as SvgLinear, RadialGradient as SvgRadial, Rect, Stop } from "react-native-svg";
import { normalizeColor, parseColor, toCss } from "@/lib/color";

export type GStop = { color: string; at: number };
export type GLayer =
  | { kind: "linear"; angle: number; stops: GStop[] }
  | { kind: "radial"; cx: number; cy: number; rx: number | null; ry: number | null; px: number | null; stops: GStop[] };

// ── CSS parsing ─────────────────────────────────────────────────────────────
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseStops(parts: string[]): GStop[] {
  const raw = parts.map((p) => {
    const m = p.match(/^(.*?)(?:\s+(-?[\d.]+)%)?$/);
    return { color: (m?.[1] ?? p).trim(), at: m?.[2] != null ? Number(m[2]) / 100 : null };
  });
  // fill in missing positions evenly
  if (raw.length) {
    if (raw[0].at == null) raw[0].at = 0;
    if (raw[raw.length - 1].at == null) raw[raw.length - 1].at = 1;
    for (let i = 1; i < raw.length - 1; i++) {
      if (raw[i].at != null) continue;
      let j = i;
      while (raw[j].at == null) j++;
      const a = raw[i - 1].at as number;
      const b = raw[j].at as number;
      for (let k = i; k < j; k++) raw[k].at = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    }
  }
  // "transparent" fades the neighbour's own colour, as CSS premultiplied blending does
  return raw.map((r, i) => {
    let color = r.color;
    if (/^transparent$/i.test(color)) {
      const src = raw[i - 1] && !/^transparent$/i.test(raw[i - 1].color) ? raw[i - 1].color : raw.find((x) => !/^transparent$/i.test(x.color))?.color ?? "#000";
      const [rr, gg, bb] = parseColor(src);
      color = toCss([rr, gg, bb, 0]);
    }
    return { color, at: r.at as number };
  });
}

export function parseCssGradients(css: string): GLayer[] {
  return splitTop(css)
    .map((layer): GLayer | null => {
      const m = layer.match(/^(linear|radial)-gradient\((.*)\)$/s);
      if (!m) return null;
      const args = splitTop(m[2]);
      if (m[1] === "linear") {
        const first = args[0];
        const deg = first.match(/^(-?[\d.]+)deg$/);
        return { kind: "linear", angle: deg ? Number(deg[1]) : 180, stops: parseStops(deg ? args.slice(1) : args) };
      }
      let spec = "";
      let rest = args;
      if (/\bat\b|circle|ellipse|^[\d.]+%/.test(args[0]) && !/^(rgba?|#|oklch)/i.test(args[0])) {
        spec = args[0];
        rest = args.slice(1);
      }
      const at = spec.match(/at\s+(-?[\d.]+)%\s+(-?[\d.]+)%/);
      const size = spec.split(/\bat\b/)[0].trim();
      const pct = size.match(/^(-?[\d.]+)%\s+(-?[\d.]+)%$/);
      const px = size.match(/^([\d.]+)px/);
      return {
        kind: "radial",
        cx: at ? Number(at[1]) / 100 : 0.5,
        cy: at ? Number(at[2]) / 100 : 0.5,
        rx: pct ? Number(pct[1]) / 100 : null,
        ry: pct ? Number(pct[2]) / 100 : null,
        px: px ? Number(px[1]) : null,
        stops: parseStops(rest),
      };
    })
    .filter((l): l is GLayer => !!l);
}

// ── layered renderer (page backgrounds) ─────────────────────────────────────
export const Gradient = memo(function Gradient({ layers, css, style }: { layers?: GLayer[]; css?: string; style?: StyleProp<ViewStyle> }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const parsed = useMemo(() => layers ?? (css ? parseCssGradients(css) : []), [layers, css]);
  const win = Dimensions.get("window");
  const [size, setSize] = useState({ w: win.width, h: win.height });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0 && (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1)) setSize({ w: width, h: height });
  };
  const { w, h } = size;

  return (
    <View style={[StyleSheet.absoluteFill, style]} onLayout={onLayout} pointerEvents="none">
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          {parsed.map((l, i) => {
            const stops = l.stops.map((s, k) => {
              const [r, g, b, a] = parseColor(s.color);
              return <Stop key={k} offset={s.at} stopColor={`rgb(${r},${g},${b})`} stopOpacity={a} />;
            });
            if (l.kind === "linear") {
              const a = (l.angle * Math.PI) / 180;
              const dx = Math.sin(a);
              const dy = -Math.cos(a);
              const len = Math.abs(w * dx) + Math.abs(h * dy);
              return (
                <SvgLinear key={i} id={`${id}${i}`} gradientUnits="userSpaceOnUse" x1={w / 2 - (dx * len) / 2} y1={h / 2 - (dy * len) / 2} x2={w / 2 + (dx * len) / 2} y2={h / 2 + (dy * len) / 2}>
                  {stops}
                </SvgLinear>
              );
            }
            const rx = l.px != null ? l.px : (l.rx ?? 1) * w;
            const ry = l.px != null ? l.px : (l.ry ?? 1) * h;
            return (
              <SvgRadial key={i} id={`${id}${i}`} gradientUnits="userSpaceOnUse" cx={l.cx * w} cy={l.cy * h} rx={rx} ry={ry} fx={l.cx * w} fy={l.cy * h}>
                {stops}
              </SvgRadial>
            );
          })}
        </Defs>
        {parsed.map((_, i) => (
          <Rect key={i} x={0} y={0} width={w} height={h} fill={`url(#${id}${i})`} />
        ))}
      </Svg>
    </View>
  );
});

// ── bounding-box fill (cards, buttons, orbs) — no layout pass needed ────────
export type FillProps = {
  /** colour stops, evenly spaced unless `at` is given */
  stops: (string | GStop)[];
  /** CSS-style angle in degrees (180 = top → bottom) */
  angle?: number;
  radial?: { cx?: number; cy?: number; r?: number };
  style?: StyleProp<ViewStyle>;
};

export const Fill = memo(function Fill({ stops, angle = 180, radial, style }: FillProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const n = stops.length;
  const st = stops.map((s, i) => (typeof s === "string" ? { color: s, at: n > 1 ? i / (n - 1) : 0 } : s));
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  // objectBoundingBox: map the CSS gradient line through the box centre
  const k = 0.5 / Math.max(Math.abs(dx), Math.abs(dy), 1e-6);
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
        <Defs>
          {radial ? (
            <SvgRadial id={id} cx={radial.cx ?? 0.5} cy={radial.cy ?? 0.5} r={radial.r ?? 0.7} fx={radial.cx ?? 0.5} fy={radial.cy ?? 0.5}>
              {st.map((s, i) => {
                const [r, g, b, al] = parseColor(normalizeColor(s.color));
                return <Stop key={i} offset={s.at} stopColor={`rgb(${r},${g},${b})`} stopOpacity={al} />;
              })}
            </SvgRadial>
          ) : (
            <SvgLinear id={id} x1={0.5 - dx * k} y1={0.5 - dy * k} x2={0.5 + dx * k} y2={0.5 + dy * k}>
              {st.map((s, i) => {
                const [r, g, b, al] = parseColor(normalizeColor(s.color));
                return <Stop key={i} offset={s.at} stopColor={`rgb(${r},${g},${b})`} stopOpacity={al} />;
              })}
            </SvgLinear>
          )}
        </Defs>
        <Rect x={0} y={0} width={1} height={1} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
});
