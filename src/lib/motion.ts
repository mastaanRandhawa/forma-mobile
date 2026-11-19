/**
 * Global reduce-motion flag: true when the user turned on Settings ›
 * Appearance › Reduce motion, or the OS accessibility setting is on.
 * Animated components read `motion.reduced` to skip springs and slides.
 */
import { AccessibilityInfo } from "react-native";

let appSetting = false;
let osSetting = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((v) => (osSetting = v))
  .catch(() => {});
AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v) => (osSetting = v));

export const motion = {
  get reduced() {
    return appSetting || osSetting;
  },
  setAppSetting(v: boolean) {
    appSetting = v;
  },
};
