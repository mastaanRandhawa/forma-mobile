import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "@/api/client";
import { useNotifications } from "@/api/hooks";
import { useTheme } from "@/theme/theme-provider";
import { colors } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Chip } from "@/components/ui/controls";
import { Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui/extra";
import { Label, Text } from "@/components/ui/text";

export default function Notifications() {
  useTheme();
  const router = useRouter();
  const n = useNotifications();
  if (n.initialLoading) return <Screen><PageHeader title="Notifications" /><PageSkeleton /></Screen>;
  const items = n.data?.items ?? [];
  return (
    <Screen>
      <PageHeader title="Notifications" right={items.some((i) => !i.readAt) ? <Chip label="Mark all read" onPress={async () => { await api.notifications.markAllRead().catch(() => {}); n.refetch(); }} /> : undefined} />
      {items.length === 0 ? <EmptyState title="You're all caught up" body="Reminders, trainer check-ins and milestones show up here." /> : null}
      {items.map((i) => (
        <Pressable
          key={i.id}
          onPress={async () => {
            if (!i.readAt) { await api.notifications.markRead(i.id).catch(() => {}); n.refetch(); }
            if (i.deepLink?.startsWith("/")) router.push(i.deepLink as never);
          }}
          onLongPress={async () => { await api.notifications.remove(i.id).catch(() => {}); n.refetch(); }}
        >
          <Card style={{ marginBottom: 10, borderColor: colors.lineSoft }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {!i.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.pink }} /> : null}
              <Label>{i.type.replace(/_/g, " ").toUpperCase()}</Label>
            </View>
            <Text variant="heading" style={{ fontSize: 17, marginVertical: 4 }}>{i.title}</Text>
            <Text color="secondary">{i.body}</Text>
            <Text variant="meta" color="tertiary" style={{ marginTop: 6 }}>{new Date(i.createdAt).toLocaleString()}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
