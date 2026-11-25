/**
 * Muscle Match — eight exercises from the RepDB catalogue; pick the main
 * muscle each one works. Wrong options never include any of the exercise's
 * primary muscles, so every question has exactly one right answer.
 */
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { repdbImage, type RepDbCatalogEntry } from "@/lib/repdb";
import { shuffle } from "@/lib/games";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { ProgressBar } from "@/components/ui/controls";
import { PressScale } from "@/components/ui/pressable";
import { SoftSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";
import type { GameProps } from "./host";

const COUNT = 8;
const MUSCLES = ["Chest", "Back", "Lats", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Abs", "Traps"];

type Question = { name: string; img: string | null; answer: string; options: string[] };

function buildQuiz(): Question[] {
  // the full catalogue is large; load it only when a quiz is built
  const catalog = (require("@/data/repdb.catalog.json") as { exercises: RepDbCatalogEntry[] }).exercises;
  // spread questions across muscles rather than drawing eight glute exercises
  const byMuscle = new Map<string, RepDbCatalogEntry[]>();
  for (const e of catalog) {
    const m = e.primary[0];
    if (m && MUSCLES.includes(m)) byMuscle.set(m, [...(byMuscle.get(m) ?? []), e]);
  }
  const muscles = shuffle([...byMuscle.keys()]);
  const picks: RepDbCatalogEntry[] = [];
  for (let i = 0; picks.length < COUNT && i < COUNT * 3; i++) {
    const list = byMuscle.get(muscles[i % muscles.length])!;
    const e = list[Math.floor(Math.random() * list.length)];
    if (!picks.includes(e)) picks.push(e);
  }
  return picks.map((e) => {
    const answer = e.primary[0];
    const wrong = shuffle(MUSCLES.filter((m) => !e.primary.includes(m))).slice(0, 3);
    return { name: e.name, img: repdbImage(e.imgStart ?? e.imgEnd), answer, options: shuffle([answer, ...wrong]) };
  });
}

export function MuscleMatch({ onDone }: GameProps) {
  useTheme();
  const [quiz] = useState(buildQuiz);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const q = quiz[idx];

  // after answering, pause briefly on the feedback, then move on
  useEffect(() => {
    if (!picked) return;
    const t = setTimeout(() => {
      if (idx + 1 >= quiz.length) {
        onDone(score, score >= COUNT - 1 ? "Anatomy expert." : score >= COUNT / 2 ? "Solid — you know your lifts." : "Every rep counts. Go again next rest.");
        return;
      }
      setPicked(null);
      setIdx(idx + 1);
    }, 800);
    return () => clearTimeout(t);
  }, [picked, idx, quiz.length, score, onDone]);

  const choose = (m: string) => {
    if (picked || !q) return;
    setPicked(m);
    const right = m === q.answer;
    if (right) setScore((s) => s + 1);
    Haptics.notificationAsync(right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
  };

  if (!q) return null;
  return (
    <View style={{ flex: 1, gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View>
          <Label>QUESTION</Label>
          <Num size={24}>{idx + 1}/{quiz.length}</Num>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Label>SCORE</Label>
          <Num size={24}>{score}</Num>
        </View>
      </View>
      <ProgressBar pct={((idx + (picked ? 1 : 0)) / quiz.length) * 100} tone="cyan" height={5} />

      <SoftSurface style={{ flex: 1, padding: 18, alignItems: "center", justifyContent: "center", gap: 10 }}>
        {q.img ? (
          <Image source={{ uri: q.img }} style={{ width: "100%", flex: 1, maxHeight: 220, minHeight: 100, borderRadius: radius.small, backgroundColor: "#fff" }} resizeMode="contain" accessibilityIgnoresInvertColors />
        ) : (
          <Ionicons name="barbell-outline" size={56} color={colors.textTertiary} />
        )}
        <Text variant="heading" style={{ textAlign: "center" }}>{q.name}</Text>
        <Text variant="meta" color="tertiary">Which muscle does this mainly work?</Text>
      </SoftSurface>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {q.options.map((m) => {
          const isAnswer = m === q.answer;
          const isPicked = m === picked;
          const bg = picked && isAnswer ? "rgba(79,214,166,0.22)" : isPicked ? "rgba(255,107,74,0.22)" : colors.surface;
          const border = picked && isAnswer ? colors.jade : isPicked ? colors.coral : "transparent";
          return (
            <PressScale key={m} onPress={() => choose(m)} haptic={false} accessibilityLabel={m}
              style={{ width: "48%", flexGrow: 1, height: 68, borderRadius: radius.small, backgroundColor: bg, borderWidth: 1.5, borderColor: border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {picked && isAnswer ? <Ionicons name="checkmark-circle" size={18} color={colors.jade} /> : picked && isPicked ? <Ionicons name="close-circle" size={18} color={colors.coral} /> : null}
              <Text style={{ fontSize: 17 }}>{m}</Text>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}
