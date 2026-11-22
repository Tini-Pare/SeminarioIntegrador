import { useWindowDimensions } from "react-native";
import { BREAKPOINT } from "../constants";

// True on phone-sized screens, for small adjustments like shorter button
// labels. Tracks the window width, so it also updates on rotation or when a
// browser window is resized.
export function useIsPhone() {
  const { width } = useWindowDimensions();
  return width < BREAKPOINT.mobile;
}
