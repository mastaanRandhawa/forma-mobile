import { Easing } from "react-native-reanimated";

/** The website's motion curves (--ease-luxury / --ease-spring-soft) and durations. */
export const EASE_LUXURY = Easing.bezier(0.22, 1, 0.36, 1);
export const EASE_SPRING_SOFT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.4, 0, 0.2, 1);
export const DUR = { press: 130, hover: 220, value: 700, section: 600, theme: 650 } as const;
