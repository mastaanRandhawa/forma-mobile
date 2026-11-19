import { useEffect, useState } from "react";
import { AppState, Linking, View } from "react-native";
import { usePrefs, useSettings } from "@/api/settings";
import { setDevicePrefs, useDevicePrefs } from "@/lib/device-prefs";
import { permissionState, requestPermission, syncWorkoutReminders, type PermissionState } from "@/lib/reminders";
import { useTheme } from "@/theme/theme-provider";
import { Screen } from "@/components/ui/screen";
import { Button, Chip } from "@/components/ui/controls";
import { Card, PageHeader, SettingRow, Toggle } from "@/components/ui/extra";
import { toast } from "@/components/ui/toast";
import { Text } from "@/components/ui/text";

type Key = "workoutReminders" | "trainerCheckins" | "milestones" | "weeklyDigest";
const ITEMS: { key: Key; label: string; hint: string }[] = [
  { key: "workoutReminders", label: "Workout reminders", hint: "A nudge on your training days." },
  { key: "trainerCheckins", label: "Trainer check-ins", hint: "Proactive messages from Kai between sessions." },
  { key: "milestones", label: "PR & milestone celebrations", hint: "When you hit a personal record or streak milestone." },
  { key: "weeklyDigest", label: "Weekly progress report", hint: "A summary of your week, by email." },
];
const TIMES = [
  { h: 6, m: 30 },
  { h: 12, m: 0 },
  { h: 17, m: 30 },
  { h: 19, m: 0 },
];
const label = (h: number, m: number) => new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function NotificationsSettings() {
  useTheme();
  const prefs = usePrefs();
  const { update } = useSettings();
  const device = useDevicePrefs();
  const [perm, setPerm] = useState<PermissionState>("undetermined");

  useEffect(() => {
    const check = () => void permissionState().then(setPerm);
    check();
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => sub.remove();
  }, []);

  const resync = (enabled = prefs.notifications.workoutReminders, h = device.reminderHour, m = device.reminderMinute) => syncWorkoutReminders({ enabled, days: device.preferredDays, hour: h, minute: m });

  const toggle = async (key: Key, v: boolean) => {
    if (key === "workoutReminders" && v && perm !== "granted" && perm !== "unavailable") {
      const next = await requestPermission();
      setPerm(next);
      if (next !== "granted") {
        toast.info("Notifications are off for Forma. Turn them on in Settings to get reminders.", { label: "Settings", onPress: () => Linking.openSettings() });
        return;
      }
    }
    update({ prefs: { notifications: { [key]: v } } });
    if (key === "workoutReminders") {
      await resync(v);
      if (v) toast.success(`Reminders on · ${device.preferredDays.map((d) => WEEKDAYS[d]).join(", ") || "no days set"} at ${label(device.reminderHour, device.reminderMinute)}`);
    }
  };

  return (
    <Screen>
      <PageHeader title="Notifications" subtitle="What Forma is allowed to reach out about." />
      {perm === "denied" ? (
        <Card>
          <Text color="secondary">Notifications are turned off for Forma in your phone's settings, so reminders can't be delivered.</Text>
          <View style={{ marginTop: 10 }}><Button label="Open Settings" variant="ghost" onPress={() => Linking.openSettings()} /></View>
        </Card>
      ) : null}
      <Card>
        {ITEMS.map((it, i) => (
          <SettingRow key={it.key} title={it.label} hint={it.hint} last={i === ITEMS.length - 1} right={<Toggle value={prefs.notifications[it.key]} onChange={(v) => void toggle(it.key, v)} />} />
        ))}
      </Card>
      {prefs.notifications.workoutReminders ? (
        <Card title="Reminder time">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TIMES.map((t) => (
              <Chip
                key={`${t.h}:${t.m}`}
                label={label(t.h, t.m)}
                active={device.reminderHour === t.h && device.reminderMinute === t.m}
                onPress={() => {
                  setDevicePrefs({ reminderHour: t.h, reminderMinute: t.m });
                  void resync(true, t.h, t.m);
                }}
              />
            ))}
          </View>
          <Text variant="meta" color="tertiary" style={{ marginTop: 10 }}>
            On {device.preferredDays.length ? device.preferredDays.map((d) => WEEKDAYS[d]).join(", ") : "no days yet"} — change your days in Training profile.{perm === "unavailable" ? " Reminders are delivered by the phone app, not in the browser." : ""}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
