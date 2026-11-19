import { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { auth } from "@/api/client";
import { useAuth } from "@/auth/auth-provider";
import { extractToken, mapAuthError } from "@/auth/errors";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button, Field } from "@/components/ui/controls";
import { Text } from "@/components/ui/text";

export default function VerifyEmail() {
  const { user, refreshUser, signOut } = useAuth();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"resend" | "check" | "verify" | null>(null);
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);

  async function verify(raw: string) {
    const t = extractToken(raw);
    if (!t) return;
    setBusy("verify");
    setNote(null);
    try {
      await auth.verifyEmail(t);
      setVerified(true);
      if (user) await refreshUser();
    } catch (e) {
      setNote(mapAuthError(e));
    } finally {
      setBusy(null);
    }
  }
  // opened from the emailed link (forma://verify-email?token=…)
  useEffect(() => {
    if (params.token) void verify(params.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  async function resend() {
    setBusy("resend");
    try {
      const r = await auth.resendVerification();
      setNote(r.throttled ? "Hold on a minute before requesting another email." : "Verification email sent.");
    } catch (e) {
      setNote(mapAuthError(e));
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    setBusy("check");
    await refreshUser();
    setBusy(null);
  }

  if (busy === "verify") return <AuthShell title="Verifying your email…" subtitle="One moment."><View /></AuthShell>;
  if (verified)
    return (
      <AuthShell title="Email verified" subtitle="Your account is confirmed.">
        {user ? <Text color="secondary">Taking you in…</Text> : <Button label="Continue to sign in" onPress={() => router.replace("/login")} />}
      </AuthShell>
    );
  if (!user)
    return (
      <AuthShell title="Verify your email" subtitle="Paste the link from your verification email, or open it on this device.">
        <Field label="verification link or code" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
        {note ? <Text variant="meta" color="danger">{note}</Text> : null}
        <Button label="Verify" onPress={() => verify(code)} disabled={!code.trim()} />
        <Button label="Back to sign in" variant="ghost" onPress={() => router.replace("/login")} />
      </AuthShell>
    );
  return (
    <AuthShell title="Check your inbox" subtitle={`We sent a verification link to ${user.email}.`}>
      <Text color="secondary">Open the link on this device — or paste it below — then come back and tap continue.</Text>
      <Field label="paste link or code · optional" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => verify(code)} />
      {note ? <Text variant="meta" color="pink">{note}</Text> : null}
      {code.trim() ? <Button label="Verify" onPress={() => verify(code)} /> : <Button label="I've verified" onPress={check} loading={busy === "check"} />}
      <Button label="Resend email" variant="ghost" onPress={resend} loading={busy === "resend"} />
      <Button label="Sign out" variant="ghost" onPress={signOut} />
    </AuthShell>
  );
}
