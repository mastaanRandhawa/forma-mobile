import { useState } from "react";
import { View } from "react-native";
import { Link, useRouter } from "expo-router";
import { auth } from "@/api/client";
import { mapAuthError } from "@/auth/errors";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button, Field } from "@/components/ui/controls";
import { Text } from "@/components/ui/text";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | undefined>();
  const router = useRouter();

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const r = await auth.forgotPassword(email.trim());
      setDevToken(r.devToken);
      setSent(true);
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={
        <View style={{ flexDirection: "row", justifyContent: "center" }}>
          <Link href="/login"><Text color="secondary">Back to sign in</Text></Link>
        </View>
      }
    >
      {sent ? (
        <>
          <Text color="secondary">If an account exists for {email.trim()}, a reset link is on its way. It expires soon, so use it right away.</Text>
          <Button label="I have the link" variant="ghost" onPress={() => router.push("/reset-password")} />
          {__DEV__ && devToken ? <Button label="Dev: open reset screen" variant="ghost" onPress={() => router.push({ pathname: "/reset-password", params: { token: devToken } })} /> : null}
          <Button label="Send again" variant="ghost" onPress={() => { setSent(false); }} />
        </>
      ) : (
        <>
          <Field label="email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
          {error ? <Text variant="meta" color="danger">{error}</Text> : null}
          <Button label="Send reset link" onPress={submit} loading={pending} disabled={!email} />
        </>
      )}
    </AuthShell>
  );
}
