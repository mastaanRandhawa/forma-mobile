import { useTheme } from "@/theme/theme-provider";
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme/tokens";

/** The atmospheric ground every screen sits on: deep plum with a wine bloom + pink glow. */
export function Atmosphere() {
  useTheme();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[colors.backgroundSoft, colors.background, colors.backgroundDeep]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[colors.pink + "48", colors.pink + "00"]}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.4, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[colors.blue + "00", colors.blue + "1A"]}
        start={{ x: 0.2, y: 0.55 }}
        end={{ x: 0.1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /** leave room for the floating tab bar */
  tabs?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function Screen({ children, scroll = true, tabs = false, contentStyle, refreshing, onRefresh }: ScreenProps) {
  useTheme();
  const insets = useSafeAreaInsets();
  const pad: ViewStyle = {
    paddingTop: insets.top + 12,
    paddingHorizontal: 20,
    paddingBottom: (tabs ? 110 : 24) + insets.bottom,
  };
  return (
    <View style={styles.root}>
      <Atmosphere />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.pinkSoft} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, contentStyle]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background } });
