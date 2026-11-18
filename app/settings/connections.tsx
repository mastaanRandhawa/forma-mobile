import { useState } from "react";
import { Platform, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/api/client";
import { useResource } from "@/api/hooks";
import { usePrefs, useSettings } from "@/api/settings";
import type { DeviceConnection } from "@/api/types";
import { useTheme } from "@/theme/theme-provider";
import { Screen } from "@/components/ui/screen";
import { Card, PageHeader, SettingRow, Toggle } from "@/components/ui/extra";
import { Button } from "@/components/ui/controls";
import { Text } from "@/components/ui/text";

const WEARABLES = [
  { key: "whoop", name: "WHOOP" },
  { key: "oura", name: "Oura" },
  { key: "garmin", name: "Garmin" },
] as const;

function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function Connections() {
  useTheme();
  const devices = useResource<DeviceConnection[]>("me-devices", () => api.me.devices());
  const prefs = usePrefs();
  const { update } = useSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const by = Object.fromEntries((devices.data ?? []).map((c) => [c.provider, c]));
  const healthName = Platform.OS === "ios" ? "Apple Health" : "Health Connect";

  async function connect(key: (typeof WEARABLES)[number]["key"]) {
    setBusy(key);
    setMsg(null);
    try {
      const r = await api.me.connectDevice(key);
      if (r.authorizeUrl) {
        await WebBrowser.openAuthSessionAsync(r.authorizeUrl);
        devices.refetch();
      } else setMsg(r.message ?? `${key} isn't configured on this deployment.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : `${key} isn't available.`);
    } finally {
      setBusy(null);
    }
  }
  async function sync(key: string) {
    setBusy(key);
    try {
      const r = await api.me.syncDevice(key);
      setMsg(`${key}: ${r.ingested} new reading${r.ingested === 1 ? "" : "s"}.`);
      devices.refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }
  async function disconnect(key: string) {
    setBusy(key);
    await api.me.disconnectDevice(key).catch(() => {});
    setBusy(null);
    devices.refetch();
  }

  return (
    <Screen>
      <PageHeader title="Connections" subtitle="Sync sleep, recovery, heart rate and activity so Forma can adjust your training." />
      <Card title="On this phone">
        <SettingRow last title={healthName} hint="Syncs steps, sleep, HRV and resting heart rate. Requires a development build with health permissions." />
      </Card>
      <Card title="Wearables">
        {WEARABLES.map(({ key, name }, i) => {
          const c = by[key];
          const connected = c?.oauthConnected;
          const hint = c?.status === "error" ? `Last sync failed${c.lastErrorAt ? ` ${timeAgo(c.lastErrorAt)}` : ""}` : connected ? (c?.lastSyncAt ? `Synced ${timeAgo(c.lastSyncAt)}` : "Connected") : "Not connected";
          return (
            <View key={key} style={{ paddingVertical: 10, gap: 10, borderBottomWidth: i === WEARABLES.length - 1 ? 0 : 1, borderBottomColor: "rgba(255,255,255,0.06)" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 16 }}>{name}</Text>
                <Text variant="meta" color="tertiary">{hint}</Text>
              </View>
              {connected ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}><Button label="Sync now" variant="ghost" loading={busy === key} onPress={() => sync(key)} style={{ height: 42 }} /></View>
                  <View style={{ flex: 1 }}><Button label="Disconnect" variant="ghost" disabled={busy === key} onPress={() => disconnect(key)} style={{ height: 42 }} /></View>
                </View>
              ) : (
                <Button label="Connect" variant="ghost" loading={busy === key} onPress={() => connect(key)} style={{ height: 42 }} />
              )}
            </View>
          );
        })}
        {msg ? <Text variant="meta" color="pink" style={{ marginTop: 8 }}>{msg}</Text> : null}
      </Card>
      <Card title="Recovery data">
        <Text color="secondary" style={{ marginBottom: 6 }}>Where Forma gets your readiness signal. Connect a health source, or check in manually.</Text>
        <SettingRow title="Manual recovery check-ins" hint="Show a daily check-in on your dashboard when there's no synced data." right={<Toggle value={prefs.recovery.manualCheckins} onChange={(v) => update({ prefs: { recovery: { manualCheckins: v } } })} />} />
        <SettingRow last title="Prompt me before my first workout" hint="Ask how you're feeling if you haven't checked in yet today." right={<Toggle value={prefs.recovery.promptBeforeFirstWorkout} onChange={(v) => update({ prefs: { recovery: { promptBeforeFirstWorkout: v } } })} />} />
      </Card>
    </Screen>
  );
}
