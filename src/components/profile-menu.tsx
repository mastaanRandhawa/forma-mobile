/**
 * ProfileMenu — the single "you" entry point, top-right on the main tabs. It
 * replaces the old "More" tab: notifications, store, settings and sign-out live
 * behind one avatar, so the tab bar only carries what you use every day.
 */
import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import { useNotifications, useWallet } from "@/api/hooks";
import { useProgression } from "@/api/settings";
import { useAuth } from "@/auth/auth-provider";
import { colors, fonts } from "@/theme/tokens";
import { PopoverMenu, type PopoverItem } from "./ui/popover";
import { Text } from "./ui/text";

export function ProfileMenu() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const prog = useProgression();
  const notes = useNotifications();
  const wallet = useWallet();
  const unread = notes.data?.unreadCount ?? 0;

  const items: PopoverItem[] = [
    { key: "notifications", label: "Notifications", icon: "notifications-outline", badge: unread ? (unread > 99 ? "99+" : unread) : undefined, onPress: () => router.push("/notifications") },
    ...(prog.has("store") ? [{ key: "store", label: "Store", icon: "bag-handle-outline" as const, hint: `${(wallet.data?.balance ?? 0).toLocaleString()} coins`, onPress: () => router.push("/store") }] : []),
    { key: "settings", label: "Settings", icon: "settings-outline", onPress: () => router.push("/settings") },
    { key: "setup", label: "Redo setup", icon: "refresh-outline", onPress: () => router.push("/onboarding") },
    {
      key: "signout",
      label: "Sign out",
      icon: "log-out-outline",
      destructive: true,
      onPress: () => Alert.alert("Sign out?", "You'll need your email and password to sign back in.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => void signOut() }]),
    },
  ];

  const initial = (user?.name ?? "?").trim()[0]?.toUpperCase() ?? "?";
  return (
    <PopoverMenu
      accessibilityLabel="Account menu"
      items={items}
      trigger={() => (
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15 }}>{initial}</Text>
          {unread ? <View style={{ position: "absolute", top: 1, right: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.pink }} /> : null}
        </View>
      )}
    />
  );
}
