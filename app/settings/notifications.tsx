import { usePrefs, useSettings } from "@/api/settings";
import { useTheme } from "@/theme/theme-provider";
import { Screen } from "@/components/ui/screen";
import { Card, PageHeader, SettingRow, Toggle } from "@/components/ui/extra";

type Key = "workoutReminders" | "trainerCheckins" | "milestones" | "weeklyDigest";
const ITEMS: { key: Key; label: string; hint: string }[] = [
  { key: "workoutReminders", label: "Workout reminders", hint: "A nudge on your training days." },
  { key: "trainerCheckins", label: "Trainer check-ins", hint: "Proactive messages from Kai between sessions." },
  { key: "milestones", label: "PR & milestone celebrations", hint: "When you hit a personal record or streak milestone." },
  { key: "weeklyDigest", label: "Weekly progress report", hint: "A summary of your week, by email." },
];

export default function NotificationsSettings() {
  useTheme();
  const prefs = usePrefs();
  const { update } = useSettings();
  return (
    <Screen>
      <PageHeader title="Notifications" subtitle="What Forma is allowed to reach out about." />
      <Card>
        {ITEMS.map((it, i) => (
          <SettingRow key={it.key} title={it.label} hint={it.hint} last={i === ITEMS.length - 1} right={<Toggle value={prefs.notifications[it.key]} onChange={(v) => update({ prefs: { notifications: { [it.key]: v } } })} />} />
        ))}
      </Card>
    </Screen>
  );
}
