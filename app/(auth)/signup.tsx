import { useState } from "react";
import { Pressable, View } from "react-native";
import { Link } from "expo-router";
import { auth } from "@/api/client";
import { useAuth } from "@/auth/auth-provider";
import { mapAuthError } from "@/auth/errors";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button, Field, ProgressBar } from "@/components/ui/controls";
import { Text } from "@/components/ui/text";
import { colors } from "@/theme/tokens";

function strength(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 14) s++;
  return s;
}

export default function Signup() {
  const { setUser } = useAuth();
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  const score = strength(password);
  const canSubmit = !!firstName && !!email && password.length >= 8 && !mismatch && !!confirm && terms;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const s = await auth.register({ email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim(), rememberMe: true });
      setUser(s.user);
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Then verify your email and we'll set up your training."
      footer={
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          <Text color="secondary">Already have an account?</Text>
          <Link href="/login"><Text>Sign in</Text></Link>
        </View>
      }
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><Field label="first name" value={firstName} onChangeText={setFirst} autoComplete="given-name" /></View>
        <View style={{ flex: 1 }}><Field label="last name" value={lastName} onChangeText={setLast} autoComplete="family-name" /></View>
      </View>
      <Field label="email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Field label="password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
      {password ? (
        <View style={{ gap: 6 }}>
          <ProgressBar pct={(score / 4) * 100} tone={score >= 3 ? "lime" : score === 2 ? "amber" : "pink"} height={5} />
          <Text variant="meta" color="tertiary">{["Too short", "Weak", "Okay", "Good", "Strong"][score]}</Text>
        </View>
      ) : null}
      <Field label="confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" error={mismatch ? "Passwords don't match." : null} />
      <Pressable onPress={() => setTerms((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 22, height: 22, borderRadius: 7, borderWidth: 1,
            borderColor: terms ? colors.pink : colors.lineHighlight,
            backgroundColor: terms ? colors.pink : "transparent",
            alignItems: "center", justifyContent: "center",
          }}
        >
          {terms ? <Text variant="meta" style={{ color: "#fff" }}>✓</Text> : null}
        </View>
        <Text color="secondary" style={{ flex: 1 }}>I agree to the Terms and Privacy Policy.</Text>
      </Pressable>
      {error ? <Text variant="meta" color="danger">{error}</Text> : null}
      <Button label="Create account" onPress={submit} loading={pending} disabled={!canSubmit} />
    </AuthShell>
  );
}
