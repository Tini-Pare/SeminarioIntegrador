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
};

export function RadioGroup<T extends string | number>({
  value,
  onChange,
  options,
  name,
  disabled = false,
  style,
}: {
  value: T;
  onChange: (value: T) => void;
  options: RadioOption<T>[];
  name?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

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
      style={[styles.container, disabled && styles.disabled, style]}
      accessibilityRole="radiogroup"
      aria-disabled={disabled}
    >
      {options.map((opt, index) => {
        const isSelected = opt.value === value;

        return (
          <Pressable
            key={String(opt.value)}
            style={styles.option}
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
            <View style={[styles.circle, isSelected && styles.circleSelected]}>
              {isSelected && <View style={styles.dot} />}
            </View>

            <Text style={[styles.label, isSelected && styles.labelSelected]}>{opt.label}</Text>
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
    disabled: {
      opacity: 0.45,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 4,
      ...(Platform.OS === "web" ? ({ cursor: "pointer", userSelect: "none" } as any) : {}),
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
  });
}
