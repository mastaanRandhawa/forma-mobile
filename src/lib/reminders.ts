/**
 * Local notifications: the rest-timer alert (so a backgrounded phone still
 * tells you rest is up) and weekly workout reminders on your training days.
 * Push permission is only requested from an explicit user action (enabling
 * reminders), never on launch. No-ops on web.
 */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const isNative = Platform.OS === "ios" || Platform.OS === "android";
const REST_ID = "forma-rest";
const REMINDER_PREFIX = "forma-reminder-";

let handlerSet = false;
/** Foreground behaviour: rest alerts stay silent in-app (the screen already shows it). */
export function configureNotifications() {
  if (!isNative || handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const kind = (n.request.content.data as { kind?: string } | undefined)?.kind;
      const quiet = kind === "rest";
      return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: !quiet, shouldSetBadge: false };
    },
  });
  if (Platform.OS === "android") {
    // eslint-disable-next-line import/namespace -- re-exported enum; TypeScript resolves it, the import plugin can't follow the .d.ts re-export
    Notifications.setNotificationChannelAsync("default", { name: "Forma", importance: Notifications.AndroidImportance.DEFAULT }).catch(() => {});
  }
}

export type PermissionState = "granted" | "denied" | "undetermined" | "unavailable";

export async function permissionState(): Promise<PermissionState> {
  if (!isNative) return "unavailable";
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "unavailable";
  }
}

export async function requestPermission(): Promise<PermissionState> {
  if (!isNative) return "unavailable";
  try {
    const p = await Notifications.requestPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "unavailable";
  }
}

export async function scheduleRestAlert(seconds: number) {
  if (!isNative || seconds < 5) return;
  if ((await permissionState()) !== "granted") return;
  await Notifications.cancelScheduledNotificationAsync(REST_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: REST_ID,
    content: { title: "Rest's up", body: "Time for your next set.", data: { kind: "rest", url: "/workout/active" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(seconds) },
  }).catch(() => {});
}

export function cancelRestAlert() {
  if (!isNative) return;
  Notifications.cancelScheduledNotificationAsync(REST_ID).catch(() => {});
}

/** Replace all workout reminders with one weekly alert per preferred day. */
export async function syncWorkoutReminders(opts: { enabled: boolean; days: number[]; hour: number; minute: number }) {
  if (!isNative) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled.filter((n) => n.identifier.startsWith(REMINDER_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    if (!opts.enabled || (await permissionState()) !== "granted") return;
    for (const day of opts.days) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${REMINDER_PREFIX}${day}`,
        content: { title: "Training day", body: "Your session is waiting. Even a short one keeps the streak alive.", data: { kind: "reminder", url: "/workouts" } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: day + 1, hour: opts.hour, minute: opts.minute },
      });
    }
  } catch {
    /* scheduling is best-effort */
  }
}

/** Route to open when the user taps a notification (cold or warm start). */
export function onNotificationTap(open: (url: string) => void) {
  if (!isNative) return () => {};
  Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      const url = (r?.notification.request.content.data as { url?: string } | undefined)?.url;
      if (url) open(url);
    })
    .catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const url = (r.notification.request.content.data as { url?: string } | undefined)?.url;
    if (url) open(url);
  });
  return () => sub.remove();
}
