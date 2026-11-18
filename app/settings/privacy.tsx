import { useState } from "react";
import { Alert, Share, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/api/client";
import { useAuth } from "@/auth/auth-provider";
import { usePrefs, useSettings } from "@/api/settings";
import { useTheme } from "@/theme/theme-provider";
import { colors } from "@/theme/tokens";
import { Screen } from "@/components/ui/screen";
import { Card, PageHeader, SettingRow, Toggle } from "@/components/ui/extra";
import { Text } from "@/components/ui/text";

const ASSURANCES = ["Processed on this device", "Raw video never uploaded", "Raw video never stored"];

export default function Privacy() {
  useTheme();
  const { bundle, update } = useSettings();
  const prefs = usePrefs();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true);
    try {
      const data = await api.me.export();
      await Share.share({ title: "forma-export.json", message: JSON.stringify(data, null, 2) });
    } catch {
      Alert.alert("Export failed", "Couldn't prepare your data. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function deleteData() {
    Alert.alert("Delete my account?", "This permanently deletes your account and all data. It can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.me.deleteAccount();
            await signOut();
          } catch (e) {
            Alert.alert("Couldn't delete", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <PageHeader title="Privacy & data" />
      <Card title="Form tracking">
        <Text color="secondary" style={{ marginBottom: 6 }}>Pose estimation for exercise technique runs entirely on your device.</Text>
        <SettingRow title="Camera form tracking" hint="Analyze exercise technique using your device's camera." right={<Toggle value={prefs.camera.formTracking} onChange={(v) => update({ prefs: { camera: { formTracking: v } } })} />} />
        <SettingRow title="Video processing" right={<Text color="secondary">On-device</Text>} />
        <SettingRow title="Store video" right={<Text color="secondary">Never</Text>} last />
        <View style={{ gap: 6, marginTop: 8 }}>
          {ASSURANCES.map((a) => (
            <View key={a} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="checkmark-circle" size={16} color={colors.lime} />
              <Text variant="meta" color="secondary">{a}</Text>
            </View>
          ))}
        </View>
      </Card>
      <Card title="Your data">
        <SettingRow title="Save form highlight clips" hint="Keep short clips of notable sets. Stored on-device only." right={<Toggle value={bundle.camera.saveHighlightClips} onChange={(v) => update({ camera: { saveHighlightClips: v } })} />} />
        <SettingRow title="Anonymous research data" hint="Share de-identified form scores to help improve Forma's models." right={<Toggle value={prefs.research.anonFormData} onChange={(v) => update({ prefs: { research: { anonFormData: v } } })} />} />
        <SettingRow icon="download-outline" title={busy ? "Preparing…" : "Export my data"} onPress={exportData} />
        <SettingRow icon="trash-outline" title="Delete my account" hint="Permanent. This can't be undone." onPress={deleteData} last />
      </Card>
    </Screen>
  );
}
