import { useState } from "react";
import { TextInput, View } from "react-native";
import { api } from "@/api/client";
import { errorMessage, invalidateResource } from "@/api/hooks";
import type { GoalWithProgress } from "@/api/types";
import { colors, fonts } from "@/theme/tokens";
import { Button } from "./ui/controls";
import { Sheet } from "./ui/extra";
import { toast } from "./ui/toast";
import { Text } from "./ui/text";

/** Log progress against a goal: add to today's total or set it outright. */
export function GoalLogSheet({ goal, onClose, onLogged }: { goal: GoalWithProgress | null; onClose: () => void; onLogged: (g: GoalWithProgress) => void }) {
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState<"inc" | "set" | null>(null);
  const run = async (mode: "increment" | "set") => {
    const n = parseFloat(val.replace(",", "."));
    if (!goal || !Number.isFinite(n) || (mode === "increment" && n === 0)) return;
    setBusy(mode === "set" ? "set" : "inc");
    try {
      const g = await api.goals.log(goal.id, n, mode);
      if (g.completed && !goal.completed) {
        if (g.coins) toast.coins(g.coins, `${goal.label} complete`);
        else toast.success(`${goal.label} complete`);
        invalidateResource("rewards");
      } else toast.success(`${goal.label} · ${g.current} / ${g.target} ${goal.unit}`);
      invalidateResource("goals");
      invalidateResource("dashboard");
      onLogged(g);
      setVal("");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet
      visible={!!goal}
      onClose={onClose}
      eyebrow={goal ? `${goal.cadence} goal` : undefined}
      title={goal ? `Log ${goal.label.toLowerCase()}` : ""}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Button label="Add" variant="accent" loading={busy === "inc"} disabled={!val} onPress={() => run("increment")} /></View>
          <View style={{ flex: 1 }}><Button label="Set total" variant="ghost" loading={busy === "set"} disabled={!val} onPress={() => run("set")} /></View>
        </View>
      }
    >
      {goal ? <Text color="secondary">So far: {goal.current.toLocaleString()} / {goal.target.toLocaleString()} {goal.unit}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
        <TextInputBig value={val} onChange={setVal} />
        <Text color="tertiary" style={{ marginBottom: 10 }}>{goal?.unit}</Text>
      </View>
    </Sheet>
  );
}

function TextInputBig({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <TextInput autoFocus value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textTertiary} style={{ minWidth: 140, fontFamily: fonts.num, fontSize: 44, color: colors.textPrimary, borderBottomWidth: 1, borderBottomColor: colors.lineHighlight, paddingBottom: 4 }} />;
}

