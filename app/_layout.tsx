import { useEffect } from "react";
import { LogBox } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Urbanist_300Light,
  Urbanist_400Regular,
  Urbanist_500Medium,
  Urbanist_600SemiBold,
  Urbanist_700Bold,
} from "@expo-google-fonts/urbanist";
import { SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { AuthProvider, useAuth } from "@/auth/auth-provider";
import { colors } from "@/theme/tokens";
import { SettingsProvider, useAppearance } from "@/api/settings";
import { ThemeProvider } from "@/theme/theme-provider";

SplashScreen.preventAutoHideAsync().catch(() => {});
// Dev-only noise from the custom tab bar re-registering routes on first auth.
LogBox.ignoreLogs(["was not handled by any navigator"]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

/** Mirrors the website's RequireAuth / RedirectIfAuthed. */
function AuthGate() {
  const { status, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const group = segments[0];
    const inAuth = group === "(auth)";
    if (status === "anon" && !inAuth) router.replace("/login");
    else if (status === "unverified" && (segments as string[])[1] !== "verify-email") router.replace("/verify-email");
    else if (status === "authed" && !user?.onboardingCompletedAt && group !== "onboarding") router.replace("/onboarding");
    else if (status === "authed" && inAuth) router.replace("/dashboard");
  }, [status, user, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "fade" }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      <Stack.Screen name="workout" options={{ presentation: "fullScreenModal" }} />
    </Stack>
  );
}

function Providers() {
  const { status } = useAuth();
  return (
    <SettingsProvider>
      <ThemedShell authKey={status} />
    </SettingsProvider>
  );
}

function ThemedShell({ authKey }: { authKey: string }) {
  const appearance = useAppearance();
  return (
    <ThemeProvider authKey={authKey} reduceMotion={appearance.reduceMotion}>
      <StatusBar style="light" />
      <AuthGate />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Urbanist_300Light,
    Urbanist_400Regular,
    Urbanist_500Medium,
    Urbanist_600SemiBold,
    Urbanist_700Bold,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Providers />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
