import { useState } from "react";
import { Linking } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/auth-provider";
import { useTheme } from "@/theme/theme-provider";
import { Screen } from "@/components/ui/screen";
import { Card, PageHeader, SettingRow } from "@/components/ui/extra";
import { Text } from "@/components/ui/text";

export default function Account() {
  useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Screen>
      <PageHeader title="Account" />
      <Card title="Account & security">
        {user ? (
          <Text color="secondary" style={{ marginBottom: 6 }}>
            Signed in as <Text>{user.email}</Text>{!user.emailVerified ? " · email unverified" : ""}.
          </Text>
        ) : null}
        <SettingRow icon="shield-checkmark-outline" title="Email, password, sessions" onPress={() => router.push("/settings/security")} />
        <SettingRow last icon="log-out-outline" title={busy ? "Signing out…" : "Sign out"} onPress={async () => { setBusy(true); await signOut(); }} />
      </Card>
      <Card title="Subscription">
        <SettingRow last title="Plan" right={<Text color="secondary">Free</Text>} />
      </Card>
      <Card title="About">
        <SettingRow title={`Forma mobile v${Constants.expoConfig?.version ?? "1.0.0"}`} />
        <SettingRow title="Privacy policy" onPress={() => Linking.openURL("https://mastaanrandhawa.github.io/forma/")} />
        <SettingRow title="Terms of service" onPress={() => Linking.openURL("https://mastaanrandhawa.github.io/forma/")} />
        <SettingRow last title="Exercise data & illustrations by RepDB" hint="repdb.co" onPress={() => Linking.openURL("https://repdb.co")} />
      </Card>
    </Screen>
  );
}
