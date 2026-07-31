import { createContext, useContext, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { light, dark, type ThemeColors } from "./theme";

type ThemeContextType = {
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  colors: light,
  isDark: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [isDark, setIsDark] = useState(scheme === "dark");

  return (
    <ThemeContext.Provider
      value={{
        colors: isDark ? dark : light,
        isDark,
        toggleTheme: () => setIsDark((v) => !v),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
