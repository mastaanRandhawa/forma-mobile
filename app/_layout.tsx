import { useEffect, useRef, type ReactNode } from "react";
import { LogBox } from "react-native";
import "@/lib/alert-web";
import { Stack, useRouter, useSegments } from "expo-router";
import { DefaultTheme, ThemeProvider as NavThemeProvider } from "expo-router/react-navigation";
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
import { Atmosphere } from "@/components/ui/atmosphere";
import { SettingsProvider, useAppearance, usePrefs } from "@/api/settings";
import { ThemeProvider, useCustomization } from "@/theme/theme-provider";
import { ToastHost } from "@/components/ui/toast";
import { OfflineBanner } from "@/components/offline-banner";
import { configureNotifications, onNotificationTap, syncWorkoutReminders } from "@/lib/reminders";
import { loadDevicePrefs } from "@/lib/device-prefs";
import { grantDailyBonus } from "@/lib/rewards";
import { motion } from "@/lib/motion";
import { EASE_LUXURY } from "@/lib/ease";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

SplashScreen.preventAutoHideAsync().catch(() => {});
// Dev-only noise from the custom tab bar re-registering routes on first auth.
LogBox.ignoreLogs(["was not handled by any navigator"]);

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

/** Mirrors the website's RequireAuth / RedirectIfAuthed. */
configureNotifications();

function AuthGate() {
  const { status, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const prefs = usePrefs();
  const ready = status === "authed" && !!user?.onboardingCompletedAt;

  // daily check-in coins (idempotent per day) + notification taps → route
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => void grantDailyBonus(), 1200);
    const off = onNotificationTap((url) => router.push(url as never));
    return () => {
      clearTimeout(t);
      off();
    };
  }, [ready, router]);

  // keep scheduled workout reminders in line with the preference
  useEffect(() => {
    if (!ready) return;
    void loadDevicePrefs().then((d) => syncWorkoutReminders({ enabled: prefs.notifications.workoutReminders, days: d.preferredDays, hour: d.reminderHour, minute: d.reminderMinute }));
  }, [ready, prefs.notifications.workoutReminders]);

  useEffect(() => {
    if (status === "loading") return;
    const group = segments[0];
    const inAuth = group === "(auth)";
    if (status === "anon" && !inAuth) router.replace("/login");
    else if (status === "unverified" && (segments as string[])[1] !== "verify-email") router.replace("/verify-email");
    else if (status === "authed" && !user?.onboardingCompletedAt && group !== "onboarding") router.replace("/onboarding");
    else if (status === "authed" && inAuth && (segments as string[])[1] !== "reset-password") router.replace("/dashboard");
  }, [status, user, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" }, animation: "fade", animationDuration: 280 }}>
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

/** Dark text on light themes, light text on dark ones. */
function ThemedStatusBar() {
  const { mode } = useCustomization();
  return <StatusBar style={mode === "light" ? "dark" : "light"} />;
}

/** A soft dip-and-return on the whole UI when the theme changes, so the swap reads as intentional. */
/** Navigation paints its own opaque scene colour; make it transparent so the root Atmosphere shows through. */
const NAV_THEME = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: "transparent", card: "transparent", border: "transparent" } };

function ThemeSwap({ children }: { children: ReactNode }) {
  const { version } = useCustomization();
  const o = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (motion.reduced) return;
    o.value = withSequence(withTiming(0.88, { duration: 120 }), withTiming(1, { duration: 520, easing: EASE_LUXURY }));
  }, [version, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

function ThemedShell({ authKey }: { authKey: string }) {
  const appearance = useAppearance();
  motion.setAppSetting(appearance.reduceMotion);
  return (
    <ThemeProvider authKey={authKey} reduceMotion={appearance.reduceMotion}>
      <Atmosphere />
      <ThemedStatusBar />
      <NavThemeProvider value={NAV_THEME}>
        <ThemeSwap>
          <AuthGate />
        </ThemeSwap>
      </NavThemeProvider>
      <OfflineBanner />
      <ToastHost />
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
