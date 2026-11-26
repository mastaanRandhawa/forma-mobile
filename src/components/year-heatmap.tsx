/**
 * A year of training at a glance: one square per day for the last 52 weeks,
 * shaded by how many sessions you did. Weeks start where you set them to.
 */
import { useMemo } from "react";
import { View } from "react-native";
import { useConsistency } from "@/api/hooks";
import { useAuth } from "@/auth/auth-provider";
import { withAlpha } from "@/lib/color";
import { colors } from "@/theme/tokens";
import { Skel } from "@/components/ui/extra";
import { Label, Text } from "@/components/ui/text";

const EMPTY = "rgba(255,255,255,0.07)";
const shade = (n: number) => (n <= 0 ? EMPTY : n === 1 ? withAlpha(colors.pink, 0.55) : colors.pink);

export function YearHeatmap() {
  const rep = useConsistency(52);
  const startMon = useAuth().user?.weekStartsMonday ?? false;
  const days = rep.data?.days;

  const { cols, trained, total } = useMemo(() => {
    if (!days?.length) return { cols: [] as (number | null)[][], trained: 0, total: 0 };
    const row = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() - (startMon ? 1 : 0) + 7) % 7;
    const out: (number | null)[][] = [];
    let col: (number | null)[] = Array(row(days[0].date)).fill(null);
    for (const d of days) {
      col.push(d.sessions);
      if (col.length === 7) {
        out.push(col);
        col = [];
      }
    }
    if (col.length) out.push([...col, ...Array(7 - col.length).fill(null)]);
    return { cols: out, trained: days.filter((d) => d.sessions > 0).length, total: days.reduce((n, d) => n + d.sessions, 0) };
  }, [days, startMon]);

  if (rep.initialLoading || !days) return <Skel h={96} r={16} />;
  return (
    <View style={{ gap: 10 }} accessibilityLabel={`${trained} days trained in the last year, ${total} sessions`}>
      <View style={{ flexDirection: "row", gap: 2 }}>
        {cols.map((c, i) => (
          <View key={i} style={{ flex: 1, gap: 2 }}>
            {c.map((n, j) => (
              <View key={j} style={{ aspectRatio: 1, borderRadius: 1.5, backgroundColor: n === null ? "transparent" : shade(n) }} />
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="meta" color="tertiary">{trained} days trained · {total} sessions</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Label>LESS</Label>
          {[0, 1, 2].map((n) => <View key={n} style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: shade(n) }} />)}
          <Label>MORE</Label>
        </View>
      </View>
    </View>
  );
}
