/**
 * Choose a new password (website: pages/ResetPassword.tsx). Opened from the
 * emailed link (forma://reset-password?token=…) or by pasting that link/code.
 */
import { useState } from "react";
import { View } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { auth } from "@/api/client";
import { extractToken, mapAuthError } from "@/auth/errors";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button, Field } from "@/components/ui/controls";
import { toast } from "@/components/ui/toast";
import { Text } from "@/components/ui/text";


function policyError(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  return classes < 3 ? "Mix at least three of: lowercase, uppercase, numbers, symbols." : null;
}

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState(params.token ?? "");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    const t = extractToken(token);
    if (!t) return setError("Paste the link or code from your reset email.");
    const p = policyError(pw);
    if (p) return setError(p);
    if (pw !== confirm) return setError("Passwords don't match.");
    setPending(true);
    try {
      await auth.resetPassword(t, pw);
      setDone(true);
      toast.success("Password updated");
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title={done ? "Password updated" : "Choose a new password"}
      subtitle={done ? "Sign in with your new password. Other devices were signed out." : "Make it something you don't use anywhere else."}
      footer={<View style={{ flexDirection: "row", justifyContent: "center" }}><Link href="/login"><Text color="secondary">Back to sign in</Text></Link></View>}
    >
      {done ? (
        <Button label="Go to sign in" onPress={() => router.replace("/login")} />
      ) : (
        <>
          {!params.token ? <Field label="reset link or code" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} placeholder="Paste from the email" /> : null}
          <Field label="new password" value={pw} onChangeText={setPw} secureTextEntry={!show} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" right={<Text variant="meta" color="secondary" onPress={() => setShow((v) => !v)} style={{ paddingHorizontal: 14 }}>{show ? "Hide" : "Show"}</Text>} />
          <Field label="confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry={!show} autoCapitalize="none" autoComplete="new-password" onSubmitEditing={submit} />
          {error ? <Text variant="meta" color="danger">{error}</Text> : null}
          <Button label="Update password" onPress={submit} loading={pending} disabled={!pw || !confirm} />
        </>
      )}
    </AuthShell>
  );
}
