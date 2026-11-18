import { useState } from "react";
import { auth } from "@/api/client";
import { useAuth } from "@/auth/auth-provider";
import { mapAuthError } from "@/auth/errors";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/controls";
import { Text } from "@/components/ui/text";

export default function VerifyEmail() {
  const { user, refreshUser, signOut } = useAuth();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"resend" | "check" | null>(null);

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

  return (
    <AuthShell title="Check your inbox" subtitle={`We sent a verification link to ${user?.email ?? "your email"}.`}>
      <Text color="secondary">Open the link on this device, then come back and tap continue.</Text>
      {note ? <Text variant="meta" color="pink">{note}</Text> : null}
      <Button label="I've verified" onPress={check} loading={busy === "check"} />
      <Button label="Resend email" variant="ghost" onPress={resend} loading={busy === "resend"} />
      <Button label="Sign out" variant="ghost" onPress={signOut} />
    </AuthShell>
  );
}
