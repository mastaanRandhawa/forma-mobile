import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { ApiRequestError, api } from "@/api/client";
import { useAuth } from "@/auth/auth-provider";
import { mapAuthError } from "@/auth/errors";
import type { ConnectedAccounts, SessionInfo } from "@/api/types";
import { useTheme } from "@/theme/theme-provider";
import { Screen } from "@/components/ui/screen";
import { Card, PageHeader, SettingRow } from "@/components/ui/extra";
import { Button, Field } from "@/components/ui/controls";
import { Text } from "@/components/ui/text";

function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const passwordOk = (p: string) => p.length >= 8 && [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length >= 3;

function Notice({ n }: { n: { v: "success" | "error"; msg: string } | null }) {
  return n ? <Text variant="meta" color={n.v === "error" ? "danger" : "pink"}>{n.msg}</Text> : null;
}

function EmailGroup() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ v: "success" | "error"; msg: string } | null>(null);
  return (
    <Card title="Email">
      <Text color="secondary">Current: <Text>{user?.email}</Text> · {user?.emailVerified ? "verified" : "unverified"}</Text>
      <View style={{ gap: 12, marginTop: 12 }}>
        <Field label="new email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="current password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" />
        <Button label="Send confirmation link" variant="ghost" loading={busy} disabled={!email || !pw} onPress={async () => {
          setBusy(true); setNotice(null);
          try {
            await api.me.changeEmail(email.trim(), pw);
            setNotice({ v: "success", msg: `Confirmation link sent to ${email.trim()}. It isn't active until you open it.` });
            setEmail(""); setPw("");
          } catch (e) { setNotice({ v: "error", msg: mapAuthError(e) }); } finally { setBusy(false); }
        }} />
        <Notice n={notice} />
      </View>
    </Card>
  );
}

function PasswordGroup() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ v: "success" | "error"; msg: string } | null>(null);
  const weak = next.length > 0 && !passwordOk(next);
  const mismatch = confirm.length > 0 && confirm !== next;
  return (
    <Card title="Password">
      <View style={{ gap: 12 }}>
        <Field label="current password" value={cur} onChangeText={setCur} secureTextEntry autoCapitalize="none" />
        <Field label="new password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" error={weak ? "Use 8+ characters with 3 of: lower, upper, number, symbol." : null} />
        <Field label="confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" error={mismatch ? "Passwords don't match." : null} />
        <Button label="Update password" variant="ghost" loading={busy} disabled={!cur || !next || weak || mismatch} onPress={async () => {
          setBusy(true); setNotice(null);
          try {
            await api.me.changePassword(cur, next);
            setNotice({ v: "success", msg: "Password changed. Other devices were signed out." });
            setCur(""); setNext(""); setConfirm("");
          } catch (e) { setNotice({ v: "error", msg: mapAuthError(e) }); } finally { setBusy(false); }
        }} />
        <Notice n={notice} />
      </View>
    </Card>
  );
}

function ConnectedGroup() {
  const [data, setData] = useState<ConnectedAccounts | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api.me.connectedAccounts().then(setData).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <Card title="Connected login providers"><Text color="tertiary">Loading…</Text></Card>;
  const rows: ["google" | "apple", boolean][] = [["google", data.google], ["apple", data.apple]];
  return (
    <Card title="Connected login providers">
      <SettingRow title="Email & password" right={<Text color="secondary">{data.password ? "Set" : "Not set"}</Text>} />
      {rows.map(([p, linked], i) => (
        <SettingRow key={p} last={i === rows.length - 1} title={p === "google" ? "Google" : "Apple"} right={linked ? <Text color="pink">Unlink</Text> : <Text color="tertiary">Not linked</Text>} onPress={linked ? async () => {
          setMsg(null);
          try { await api.me.unlinkAccount(p); await load(); } catch (e) { setMsg(e instanceof ApiRequestError ? mapAuthError(e) : "Couldn't unlink."); }
        } : undefined} />
      ))}
      {msg ? <Text variant="meta" color="danger">{msg}</Text> : null}
    </Card>
  );
}

function SessionsGroup() {
  const [rows, setRows] = useState<SessionInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.me.sessions().then(setRows).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <Card title="Active sessions & devices">
      {!rows ? <Text color="tertiary">Loading…</Text> : (
        <>
          {rows.map((s, i) => (
            <SettingRow key={s.id} last={i === rows.length - 1} icon="phone-portrait-outline" title={`${s.userAgent || "Unknown device"}${s.current ? " · this device" : ""}`} hint={`${s.ip || "—"} · active ${timeAgo(s.lastSeenAt)}`} right={!s.current ? <Text color="pink">Revoke</Text> : undefined} onPress={!s.current ? async () => { setBusy(true); await api.me.revokeSession(s.id).catch(() => {}); await load(); setBusy(false); } : undefined} />
          ))}
          {rows.some((s) => !s.current) ? (
            <View style={{ marginTop: 12 }}>
              <Button label="Sign out other devices" variant="ghost" loading={busy} onPress={async () => { setBusy(true); await api.me.revokeOtherSessions().catch(() => {}); await load(); setBusy(false); }} />
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

export default function Security() {
  useTheme();
  const { signOutEverywhere } = useAuth();
  return (
    <Screen>
      <PageHeader title="Account security" />
      <EmailGroup />
      <PasswordGroup />
      <ConnectedGroup />
      <SessionsGroup />
      <Button label="Sign out everywhere" variant="ghost" onPress={signOutEverywhere} />
    </Screen>
  );
}
