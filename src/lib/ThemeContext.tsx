import { createContext, useContext, type ReactNode } from "react";
import { light, type ThemeColors } from "./theme";

// The app is light-only. This context stays so every screen keeps using
// `useTheme().colors` instead of importing `light` directly (and so a theme
// switch could be reintroduced in one place if it's ever wanted again).
type ThemeContextType = { colors: ThemeColors };

const ThemeContext = createContext<ThemeContextType>({ colors: light });

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={{ colors: light }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
