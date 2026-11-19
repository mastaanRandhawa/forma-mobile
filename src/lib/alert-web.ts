/**
 * react-native-web's Alert.alert is a no-op, which silently disabled every
 * confirmation dialog in the web build. Map it onto window.confirm/alert so
 * destructive actions still ask first. Native platforms are untouched.
 */
import { Alert, Platform } from "react-native";

if (Platform.OS === "web" && typeof window !== "undefined") {
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join("\n\n");
    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const cancel = buttons.find((b) => b.style === "cancel");
    const actions = buttons.filter((b) => b !== cancel);
    for (const a of actions) {
      if (window.confirm(actions.length > 1 ? `${text}\n\n${a.text}?` : text)) {
        a.onPress?.();
        return;
      }
    }
    cancel?.onPress?.();
  };
}
