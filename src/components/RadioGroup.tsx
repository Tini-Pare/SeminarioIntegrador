import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export type RadioOption<T extends string | number> = {
  value: T;
  label: string;
  badge?: {
    bg: string;
    fg: string;
    accent: string;
  };
};

export function RadioGroup<T extends string | number>({
  value,
  onChange,
  options,
  name,
  disabled = false,
  style,
  variant = "default",
  ariaLabelledBy,
}: {
  value?: T | null;
  onChange: (value: T) => void;
  options: RadioOption<T>[];
  name?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: "default" | "cards";
  ariaLabelledBy?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const isCards = variant === "cards";

  const handleKeyDown = (e: any, index: number) => {
    if (disabled) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault?.();
      const nextIndex = (index + 1) % options.length;
      onChange(options[nextIndex].value);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault?.();
      const prevIndex = (index - 1 + options.length) % options.length;
      onChange(options[prevIndex].value);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault?.();
      onChange(options[index].value);
    }
  };

  return (
    <View
      style={[
        isCards ? styles.cardsContainer : styles.container,
        disabled && styles.disabled,
        style,
      ]}
      accessibilityRole="radiogroup"
      aria-disabled={disabled}
      aria-labelledby={ariaLabelledBy}
    >
      {options.map((opt, index) => {
        const isSelected = opt.value === value;
        const badge = opt.badge;
        const isFocused = focusedIndex === index;

        if (isCards) {
          return (
            <Pressable
              key={String(opt.value)}
              style={[
                styles.cardOption,
                isSelected ? styles.cardOptionSelected : styles.cardOptionUnselected,
                isFocused && styles.cardOptionFocused,
              ]}
              onPress={() => !disabled && onChange(opt.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled }}
              accessibilityLabel={opt.label}
              aria-checked={isSelected}
              aria-disabled={disabled}
              tabIndex={disabled ? -1 : isSelected ? 0 : index === 0 && !value ? 0 : -1}
              onFocus={() => setFocusedIndex(index)}
              onBlur={() => setFocusedIndex(null)}
              // @ts-ignore onKeyDown is supported on react-native-web
              onKeyDown={(e: any) => handleKeyDown(e, index)}
            >
              <View
                style={[
                  styles.cardCircle,
                  isSelected ? styles.cardCircleSelected : styles.cardCircleUnselected,
                ]}
              >
                {isSelected && <View style={styles.cardDot} />}
              </View>

              <Text
                style={[
                  styles.cardLabel,
                  isSelected && styles.cardLabelSelected,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={String(opt.value)}
            style={[
              styles.option,
              badge && styles.optionWithBadge,
              badge &&
                (isSelected
                  ? { borderColor: badge.accent, borderWidth: 2 }
                  : { borderColor: colors.border, borderWidth: 2 }),
            ]}
            onPress={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected, disabled }}
            accessibilityLabel={opt.label}
            aria-checked={isSelected}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : isSelected ? 0 : -1}
            // @ts-ignore onKeyDown is supported on react-native-web
            onKeyDown={(e: any) => handleKeyDown(e, index)}
          >
            <View
              style={[
                styles.circle,
                isSelected && (badge ? { borderColor: badge.accent } : styles.circleSelected),
              ]}
            >
              {isSelected && (
                <View
                  style={[
                    styles.dot,
                    badge && { backgroundColor: badge.accent },
                  ]}
                />
              )}
            </View>

            {badge ? (
              <View style={[styles.pill, { backgroundColor: badge.bg }]}>
                <Text style={[styles.pillText, { color: badge.fg }]}>{opt.label}</Text>
              </View>
            ) : (
              <Text style={[styles.label, isSelected && styles.labelSelected]}>{opt.label}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 22,
    },
    cardsContainer: {
      flexDirection: "column",
      gap: 8,
      width: "100%",
    },
    disabled: {
      opacity: 0.45,
      ...(Platform.OS === "web" ? ({ cursor: "not-allowed" } as any) : {}),
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 4,
      ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
    },
    optionWithBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: c.bgInput,
      gap: 8,
    },
    pill: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
    },
    pillText: {
      fontSize: 13,
      fontWeight: "600",
    },
    circle: {
      width: 19,
      height: 19,
      borderRadius: 9.5,
      borderWidth: 1.5,
      borderColor: c.borderInput,
      backgroundColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    circleSelected: {
      borderColor: c.accent,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.accent,
    },
    label: {
      fontSize: 13.5,
      fontWeight: "400",
      color: c.text,
    },
    labelSelected: {
      fontWeight: "700",
    },
    // Full-width card variant styles (WCAG 1.4.11 / 1.4.3 compliant)
    cardOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      width: "100%",
      minHeight: 48,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
    },
    cardOptionUnselected: {
      backgroundColor: "#ffffff",
      borderWidth: 1.5,
      borderColor: "#7d8873",
    },
    cardOptionSelected: {
      backgroundColor: "rgba(79, 99, 64, 0.08)",
      borderWidth: 2,
      borderColor: c.accent,
    },
    cardOptionFocused: {
      ...(Platform.OS === "web"
        ? ({
            outlineColor: c.accent,
            outlineWidth: 2,
            outlineStyle: "solid",
            outlineOffset: 2,
          } as any)
        : {}),
    },
    cardCircle: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    cardCircleUnselected: {
      borderWidth: 2,
      borderColor: "#556049",
    },
    cardCircleSelected: {
      borderWidth: 2,
      borderColor: c.accent,
    },
    cardDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.accent,
    },
    cardLabel: {
      fontSize: 15,
      color: c.text,
      flex: 1,
      fontWeight: "400",
      lineHeight: 20,
    },
    cardLabelSelected: {
      fontWeight: "600",
    },
  });
}
