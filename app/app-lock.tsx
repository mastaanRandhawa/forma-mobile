/**
 * App lock — pick social apps to lock, grant the two Android permissions, and
 * spend coins on timed passes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, PermissionsAndroid, Platform, Switch } from "react-native";
import { api } from "@/api/client";
import { errorMessage, invalidateResource, useResource } from "@/api/hooks";
import { useTheme } from "@/theme/theme-provider";
import { colors } from "@/theme/tokens";
import { appLock, applyPass, type LockStatus } from "@/lib/app-lock";
import { Screen } from "@/components/ui/screen";
import { Button, SectionHeading } from "@/components/ui/controls";
import { Card, ErrorState, PageHeader, SettingRow } from "@/components/ui/extra";
import { toast } from "@/components/ui/toast";
import { Num, Text } from "@/components/ui/text";

const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function AppLockScreen() {
  useTheme();
  const [status, setStatus] = useState<LockStatus | null>(() => appLock?.getStatus() ?? null);
  const [apps, setApps] = useState<{ id: string; label: string }[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  // kept until a purchase succeeds, so retrying after a lost response isn't charged twice
  const requestIds = useRef<Record<number, string>>({});
  const pass = useResource("app-pass", () => api.rewards.appPass());

  const refresh = useCallback(() => setStatus(appLock?.getStatus() ?? null), []);

  // permissions are granted in system settings, so re-read on return and tick the countdown
  useEffect(() => {
    void appLock?.getInstalledApps().then(setApps);
    const timer = setInterval(refresh, 5000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (!pass.data) return;
    applyPass(pass.data);
    refresh();
  }, [pass.data, refresh]);

  if (!appLock || !status) {
    return (
      <Screen>
        <PageHeader title="App lock" />
        <Card>
          <Text color="secondary">
            {Platform.OS === "android" ? "This build doesn't include app lock. Install a new Forma build to use it." : "App lock is only available on Android for now."}
          </Text>
        </Card>
      </Screen>
    );
  }

  const lock = appLock;
  const permitted = status.usageAccess && status.overlay;
  const minutesLeft = Math.ceil(status.remainingMs / 60_000);

  const setEnabled = async (on: boolean) => {
    try {
      // for the "locked / time left" notification; locking works without it
      if (on && Number(Platform.Version) >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      lock.setEnabled(on);
    } catch (e) {
      toast.error(errorMessage(e as Error));
    }
    refresh();
  };

  const toggleApp = (id: string, on: boolean) => {
    lock.setBlocked(on ? [...status.blocked, id] : status.blocked.filter((x) => x !== id));
    refresh();
  };

  const buy = async (minutes: number) => {
    setBusy(minutes);
    try {
      requestIds.current[minutes] ??= newRequestId();
      const next = await api.rewards.buyAppPass(minutes, requestIds.current[minutes]);
      delete requestIds.current[minutes];
      applyPass(next);
      pass.mutate(next);
      invalidateResource("wallet");
      invalidateResource("rewards");
      toast.success(`${minutes} minutes unlocked`);
    } catch (e) {
      toast.error(errorMessage(e as Error));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <Screen onRefresh={pass.reload}>
      <PageHeader title="App lock" subtitle="Earn coins by training, spend them to scroll" />

      <Card>
        <SettingRow
          icon="lock-closed-outline"
          title="Lock my apps"
          hint={!permitted ? "Allow both permissions below first" : !status.blocked.length ? "Pick at least one app below" : status.enabled ? "On" : "Off"}
          right={
            <Switch
              accessibilityLabel="Lock my apps"
              value={status.enabled}
              disabled={!status.enabled && (!permitted || !status.blocked.length)}
              onValueChange={(on) => void setEnabled(on)}
              trackColor={{ true: colors.pink }}
            />
          }
        />
      </Card>

      {!permitted ? (
        <>
          <SectionHeading title="Permissions" />
          <Card>
            <Text variant="meta" color="tertiary" style={{ marginBottom: 6 }}>
              Forma reads which app is on screen so it can cover the ones you lock. That stays on your phone.
            </Text>
            <SettingRow icon="eye-outline" title="Usage access" hint={status.usageAccess ? "Allowed" : "Find Forma in the list and turn it on"} onPress={() => lock.openUsageAccessSettings()} />
            <SettingRow icon="layers-outline" title="Display over other apps" hint={status.overlay ? "Allowed" : "Needed to show the lock screen"} onPress={() => lock.openOverlaySettings()} />
          </Card>
        </>
      ) : null}

      <SectionHeading title="Apps" />
      <Card>
        {apps.length ? (
          apps.map((a) => (
            <SettingRow
              key={a.id}
              title={a.label}
              right={<Switch accessibilityLabel={`Lock ${a.label}`} value={status.blocked.includes(a.id)} onValueChange={(on) => toggleApp(a.id, on)} trackColor={{ true: colors.pink }} />}
            />
          ))
        ) : (
          <Text color="secondary">No supported social apps found on this phone.</Text>
        )}
      </Card>

      <SectionHeading title="Passes" />
      {pass.error && !pass.data ? (
        <ErrorState message={errorMessage(pass.error)} onRetry={pass.refetch} />
      ) : (
        <Card>
          <Num size={20}>{(pass.data?.balance ?? 0).toLocaleString()}</Num>
          <Text variant="meta" color="tertiary" style={{ marginBottom: 12 }}>
            coins · {minutesLeft ? `unlocked for ${minutesLeft} more min` : "no pass running"}
          </Text>
          {pass.data?.options.map((o) => (
            <Button
              key={o.minutes}
              label={`${o.minutes} min · ${o.price} coins`}
              variant="secondary"
              loading={busy === o.minutes}
              disabled={busy !== null || pass.data!.balance < o.price}
              onPress={() => void buy(o.minutes)}
              style={{ marginBottom: 8 }}
            />
          ))}
          <Text variant="meta" color="tertiary">One pass opens all your locked apps. The time runs even if you aren&apos;t using them.</Text>
        </Card>
      )}
    </Screen>
  );
}
