import { useState } from "react";
import { Pressable, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { auth } from "@/api/client";
import { useAuth } from "@/auth/auth-provider";
import { mapAuthError } from "@/auth/errors";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button, Field } from "@/components/ui/controls";
import { Text } from "@/components/ui/text";

export default function Login() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const s = await auth.login(email.trim(), password, true);
      setUser(s.user);
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up your training."
      footer={
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          <Text color="secondary">New to Forma?</Text>
          <Link href="/signup"><Text>Create an account</Text></Link>
        </View>
      }
    >
      <Field label="email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field
        label="password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
        right={
          <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} style={{ paddingHorizontal: 14 }}>
            <Text variant="meta" color="secondary">{show ? "Hide" : "Show"}</Text>
          </Pressable>
        }
      />
      <Link href="/forgot-password" style={{ alignSelf: "flex-end" }}>
        <Text variant="meta" color="secondary">Forgot password?</Text>
      </Link>
      {error ? <Text variant="meta" color="danger">{error}</Text> : null}
      <Button label="Sign in" onPress={submit} loading={pending} disabled={!email || !password} />
    </AuthShell>
  );
}
