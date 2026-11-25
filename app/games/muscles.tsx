/**
 * Muscle Match — ten exercises from the RepDB catalogue; pick the main muscle
 * each one works. Wrong options never include any of the exercise's primary
 * muscles, so every question has exactly one right answer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { repdbImage, type RepDbCatalogEntry } from "@/lib/repdb";
import { shuffle } from "@/lib/games";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { GameIntro, GameResult } from "@/components/games";
import { Screen } from "@/components/ui/screen";
import { PageHeader } from "@/components/ui/extra";
import { ProgressBar } from "@/components/ui/controls";
import { PressScale } from "@/components/ui/pressable";
import { SoftSurface } from "@/components/ui/surface";
import { Label, Num, Text } from "@/components/ui/text";

const COUNT = 10;
const MUSCLES = ["Chest", "Back", "Lats", "Shoulders", "Biceps", "Triceps", "Quads", "Hamstrings", "Glutes", "Calves", "Abs", "Traps"];

type Question = { name: string; img: string | null; answer: string; options: string[] };

function buildQuiz(): Question[] {
  // the full catalogue is large; load it only when a quiz is built
  const catalog = (require("@/data/repdb.catalog.json") as { exercises: RepDbCatalogEntry[] }).exercises;
  const pool = catalog.filter((e) => e.primary.length > 0 && MUSCLES.includes(e.primary[0]));
  // spread questions across muscles rather than drawing ten glute exercises
  const byMuscle = new Map<string, RepDbCatalogEntry[]>();
  for (const e of pool) byMuscle.set(e.primary[0], [...(byMuscle.get(e.primary[0]) ?? []), e]);
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

export default function MuscleMatch() {
  useTheme();
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [quiz, setQuiz] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  const start = useCallback(() => {
    setQuiz(buildQuiz());
    setIdx(0);
    setScore(0);
    setPicked(null);
    setPhase("play");
  }, []);

  const q = quiz[idx];

  // after answering, pause on the feedback then move on
  useEffect(() => {
    if (!picked) return;
    const t = setTimeout(() => {
      setPicked(null);
      if (idx + 1 >= quiz.length) setPhase("done");
      else setIdx(idx + 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [picked, idx, quiz.length]);

  const choose = (m: string) => {
    if (picked || !q) return;
    setPicked(m);
    const right = m === q.answer;
    if (right) setScore((s) => s + 1);
    Haptics.notificationAsync(right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
  };

  const progress = useMemo(() => (quiz.length ? ((idx + (picked ? 1 : 0)) / quiz.length) * 100 : 0), [idx, picked, quiz.length]);

  return (
    <Screen reveal={false}>
      <PageHeader title="Muscle Match" />
      {phase === "intro" ? (
        <GameIntro id="muscles" onStart={start} />
      ) : phase === "done" ? (
        <GameResult id="muscles" score={score} detail={score >= 9 ? "Anatomy expert." : score >= 6 ? "Solid — you know your lifts." : "Every rep counts. Go again?"} onAgain={start} />
      ) : q ? (
        <View style={{ gap: 14 }}>
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
          <ProgressBar pct={progress} tone="cyan" height={5} />

          <SoftSurface style={{ padding: 20, alignItems: "center", gap: 12 }}>
            {q.img ? (
              <Image source={{ uri: q.img }} style={{ width: 160, height: 160, borderRadius: radius.small, backgroundColor: "#fff" }} resizeMode="contain" accessibilityIgnoresInvertColors />
            ) : (
              <Ionicons name="barbell-outline" size={56} color={colors.textTertiary} />
            )}
            <Text variant="heading" style={{ textAlign: "center" }}>{q.name}</Text>
            <Text variant="meta" color="tertiary">Which muscle does this mainly work?</Text>
          </SoftSurface>

          <View style={{ gap: 10 }}>
            {q.options.map((m) => {
              const isAnswer = m === q.answer;
              const isPicked = m === picked;
              const bg = picked && isAnswer ? "rgba(79,214,166,0.22)" : isPicked ? "rgba(255,107,74,0.22)" : colors.surface;
              const border = picked && isAnswer ? colors.jade : isPicked ? colors.coral : "transparent";
              return (
                <PressScale key={m} onPress={() => choose(m)} disabled={!!picked && !isAnswer && !isPicked} haptic={false} accessibilityLabel={m}
                  style={{ height: 54, borderRadius: radius.pill, backgroundColor: bg, borderWidth: 1.5, borderColor: border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {picked && isAnswer ? <Ionicons name="checkmark-circle" size={18} color={colors.jade} /> : picked && isPicked ? <Ionicons name="close-circle" size={18} color={colors.coral} /> : null}
                  <Text style={{ fontSize: 16 }}>{m}</Text>
                </PressScale>
              );
            })}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
