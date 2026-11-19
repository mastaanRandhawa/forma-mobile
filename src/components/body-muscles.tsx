/**
 * BodyMuscles — the website's body map, using the same `body-muscles` package.
 *
 * The package's `BodyChart` class draws into the DOM, which doesn't exist in
 * React Native — but its anatomy is plain data (`FRONT_MUSCLES` / `BACK_MUSCLES`:
 * 40 + 49 SVG paths with ids and names) plus the exact viewBoxes it uses. So we
 * keep the library as the single source of the anatomy and render those paths
 * with react-native-svg, with the same group→muscle mapping, 0–10 heat scale,
 * dimmed silhouette layer, stroke rules and selection styling as the web
 * wrapper (`components/BodyMuscles.tsx`).
 */
import { memo, useMemo } from "react";
import { View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { BACK_MUSCLES, FRONT_MUSCLES } from "body-muscles";
import { mix } from "@/lib/color";

/** App muscle group → body-muscles path ids (identical to the website). */
export const GROUP_TO_IDS: Record<string, string[]> = {
  chest: ["chest-upper-left", "chest-upper-right", "chest-lower-left", "chest-lower-right"],
  shoulders: ["shoulder-front-left", "shoulder-front-right", "shoulder-side-left", "shoulder-side-right", "deltoid-rear-left", "deltoid-rear-right", "traps-upper-left", "traps-upper-right"],
  triceps: ["triceps-long-left", "triceps-lateral-left", "triceps-long-right", "triceps-lateral-right"],
  biceps: ["biceps-left", "biceps-right"],
  abs: ["abs-upper-left", "abs-upper-right", "abs-lower-left", "abs-lower-right", "obliques-left", "obliques-right"],
  back: ["lats-upper-left", "lats-mid-left", "lats-lower-left", "lats-upper-right", "lats-mid-right", "lats-lower-right", "lower-back-erectors-left", "lower-back-erectors-right", "spine", "traps-mid-left", "traps-mid-right", "traps-lower-left", "traps-lower-right"],
  quads: ["quads-left", "quads-right"],
  glutes: ["gluteus-maximus-left", "gluteus-maximus-right", "gluteus-medius-left", "gluteus-medius-right"],
  hamstrings: ["hamstrings-medial-left", "hamstrings-lateral-left", "hamstrings-medial-right", "hamstrings-lateral-right"],
  calves: ["calves-gastroc-medial-left", "calves-gastroc-lateral-left", "calves-soleus-left", "calves-gastroc-medial-right", "calves-gastroc-lateral-right", "calves-soleus-right"],
};
const ID_TO_GROUP = new Map<string, string>(Object.entries(GROUP_TO_IDS).flatMap(([g, ids]) => ids.map((id) => [id, g] as const)));

/** Same neutral→deep-red heat ramp the website installs over the library's colours. */
export const HEAT_STOPS = ["#E5E7EB", "#FEE2E2", "#FCA5A5", "#EF4444", "#B91C1C", "#7F1D1D"];
export const FATIGUE_STOPS = ["#86EFAC", "#BEF264", "#FDE68A", "#FCA5A5", "#EF4444", "#B91C1C"];

function rampColor(stops: string[], t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const pos = c * (stops.length - 1);
  const i = Math.min(Math.floor(pos), stops.length - 2);
  return mix(stops[i], stops[i + 1], pos - i);
}

type Muscle = { id: string; name: string; path: string };
const FRONT = FRONT_MUSCLES as unknown as Muscle[];
const BACK = BACK_MUSCLES as unknown as Muscle[];

/** Per-muscle 0–10 intensity: hardest group = 10, the rest scale to it; untrained = 0. */
function buildIntensity(activation: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const max = Math.max(0, ...Object.values(activation).filter((v) => Number.isFinite(v)));
  for (const [group, ids] of Object.entries(GROUP_TO_IDS)) {
    const n = max > 0 ? Math.max(0, activation[group] ?? 0) / max : 0;
    const level = Math.max(0, Math.min(10, Math.round(n * 10)));
    for (const id of ids) out[id] = level;
  }
  return out;
}

export const BodyMuscles = memo(function BodyMuscles({
  activation,
  view = "front",
  stops = HEAT_STOPS,
  selectedGroup,
  height = 360,
  onSelect,
}: {
  activation: Record<string, number>;
  view?: "front" | "back";
  stops?: string[];
  selectedGroup?: string | null;
  height?: number;
  /** group key (e.g. "chest") + the library's display name for the tapped path */
  onSelect?: (group: string | null, name: string, id: string) => void;
}) {
  const muscles = view === "back" ? BACK : FRONT;
  const level = useMemo(() => buildIntensity(activation), [activation]);
  const viewBox = view === "front" ? "0 0 35 93" : "37 0 35 93";
  return (
    <View style={{ alignSelf: "stretch", alignItems: "center" }}>
      <Svg width="100%" height={height} viewBox={viewBox} accessibilityLabel={`${view === "front" ? "Anterior" : "Posterior"} muscle activation map`}>
        {/* dim silhouette behind the muscles */}
        <G opacity={0.1}>
          {muscles.map((m) => (
            <Path key={`bg-${m.id}`} d={m.path} fill="#cbd5e1" />
          ))}
        </G>
        {muscles.map((m) => {
          const lv = level[m.id] ?? 0;
          const group = ID_TO_GROUP.get(m.id) ?? null;
          const selected = !!selectedGroup && group === selectedGroup;
          return (
            <Path
              key={m.id}
              d={m.path}
              fill={rampColor(stops, lv / 10)}
              fillOpacity={lv === 0 && !selected ? 0.6 : 1}
              stroke={selected ? "#ffffff" : "#1e293b"}
              strokeWidth={selected ? 0.3 : 0.1}
              onPress={() => onSelect?.(group, m.name, m.id)}
            />
          );
        })}
      </Svg>
    </View>
  );
});
