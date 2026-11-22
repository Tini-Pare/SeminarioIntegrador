import { Platform, type PressableStateCallbackType, type ViewStyle } from "react-native";

// react-native-web supports position: "fixed", which pins a dropdown's
// backdrop to the viewport instead of the nearest scroll container. RN 0.88's
// strict types only allow "absolute" | "relative" | "static", so the web value
// is cast here once instead of in every dropdown.
export const overlayPosition = (
  Platform.OS === "web" ? "fixed" : "absolute"
) as ViewStyle["position"];

// react-native-web adds `hovered` to the state Pressable passes to its style
// callback; RN's types only declare `pressed`. Always undefined on native.
export type WebPressableState = PressableStateCallbackType & { hovered?: boolean };
