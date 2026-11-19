/**
 * Notification inbox (mobile-only — the website surfaces these as toasts).
 * Pull to refresh, tap to open (marks read), swipe left to delete.
 */
import { Alert, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useNotifications } from "@/api/hooks";
import type { NotificationList } from "@/api/types";
import { useTheme } from "@/theme/theme-provider";
import { colors, radius } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Chip } from "@/components/ui/controls";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/ui/extra";
import { toast } from "@/components/ui/toast";
import { Label, Text } from "@/components/ui/text";

type Item = NotificationList["items"][number];

// website paths that differ in the app
const ROUTE_MAP: Record<string, string> = { "/exercise-library": "/exercises", "/workouts/active": "/workout/active", "/workouts/builder": "/workout/builder", "/training": "/workouts" };
const toRoute = (link: string) => ROUTE_MAP[link.split("?")[0]] ?? link;

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const ICON: Record<string, keyof typeof Ionicons.glyphMap> = { workout_reminder: "barbell-outline", personal_record: "trophy-outline", achievement: "medal-outline", trainer_checkin: "chatbubble-ellipses-outline", streak: "flame-outline", weekly_summary: "stats-chart-outline" };

export default function Notifications() {
  useTheme();
  const router = useRouter();
  const n = useNotifications();
  const items = n.data?.items ?? [];

  const patch = (fn: (l: Item[]) => Item[]) => {
    if (!n.data) return;
    const next = fn(n.data.items);
    n.mutate({ ...n.data, items: next, unreadCount: next.filter((x) => !x.readAt).length });
    invalidateResource("dashboard");
  };
  const open = async (i: Item) => {
    if (!i.readAt) {
      patch((l) => l.map((x) => (x.id === i.id ? { ...x, readAt: new Date().toISOString() } : x)));
      api.notifications.markRead(i.id).catch(() => n.refetch());
    }
    if (i.deepLink?.startsWith("/")) router.push(toRoute(i.deepLink) as never);
  };
  const remove = (i: Item) =>
    Alert.alert("Delete notification?", "It will be removed from your list.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void doRemove(i) }]);
  const doRemove = async (i: Item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    patch((l) => l.filter((x) => x.id !== i.id));
    try {
      await api.notifications.remove(i.id);
    } catch (e) {
      toast.error(errorMessage(e as Error));
      n.refetch();
    }
  };
  const markAll = async () => {
    patch((l) => l.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    await api.notifications.markAllRead().catch(() => n.refetch());
  };

  if (n.initialLoading) return <Screen><PageHeader title="Notifications" /><PageSkeleton /></Screen>;
  const today = items.filter((i) => new Date(i.createdAt).toDateString() === new Date().toDateString());
  const earlier = items.filter((i) => !today.includes(i));

  const row = (i: Item) => (
    <ReanimatedSwipeable
      key={i.id}
      friction={2}
      rightThreshold={60}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable onPress={() => remove(i)} accessibilityLabel="Delete notification" style={{ width: 84, marginLeft: 8, marginBottom: 10, borderRadius: radius.medium, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </Pressable>
      )}
    >
      <Pressable onPress={() => open(i)} accessibilityHint="Swipe left to delete" style={{ flexDirection: "row", gap: 12, padding: 14, marginBottom: 10, borderRadius: radius.medium, backgroundColor: colors.surfaceOpaque, borderWidth: 1, borderColor: i.readAt ? colors.lineSoft : "rgba(213,26,122,0.35)" }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: i.readAt ? colors.surface : "rgba(213,26,122,0.18)" }}>
          <Ionicons name={ICON[i.type] ?? "notifications-outline"} size={17} color={i.readAt ? colors.textSecondary : colors.pink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Label numberOfLines={1} style={{ flex: 1 }}>{i.type.replace(/_/g, " ").toUpperCase()}</Label>
            <Text variant="meta" color="tertiary">{ago(i.createdAt)}</Text>
          </View>
          <Text style={{ fontSize: 16 }}>{i.title}</Text>
          <Text color="secondary">{i.body}</Text>
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );

  return (
    <Screen refreshing={n.loading && !n.initialLoading} onRefresh={n.refetch}>
      <PageHeader title="Notifications" right={items.some((i) => !i.readAt) ? <Chip label="Mark all read" onPress={markAll} /> : undefined} />
      {n.error && !n.data ? <ErrorState message={errorMessage(n.error)} onRetry={n.refetch} /> : null}
      {!n.error && items.length === 0 ? <EmptyState title="You're all caught up" body="Reminders, trainer check-ins and milestones show up here." /> : null}
      {today.length ? <><Label style={{ marginBottom: 8 }}>TODAY</Label>{today.map(row)}</> : null}
      {earlier.length ? <><Label style={{ marginBottom: 8, marginTop: today.length ? 8 : 0 }}>EARLIER</Label>{earlier.map(row)}</> : null}
      {items.length ? <Text variant="meta" color="tertiary" style={{ textAlign: "center", marginTop: 4 }}>Swipe left on a notification to delete it.</Text> : null}
    </Screen>
  );
}
