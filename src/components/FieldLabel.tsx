import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import { Tooltip } from "./Tooltip";

// A form field's label, with the red asterisk (and "Campo obligatorio"
// tooltip) MaintenancePlanModal uses for required fields. The label keeps
// the form's own text style, margins included.
export function FieldLabel({
  text,
  required = false,
  style,
}: {
  text: string;
  required?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  // The label's margins go on the row, so the asterisk lines up with the
  // text instead of with the text plus its margins.
  const { marginTop, marginBottom, ...textStyle } = StyleSheet.flatten(style) ?? {};

  return (
    <View style={[styles.row, { marginTop, marginBottom }]}>
      <Text style={textStyle}>{text}</Text>

      {required && (
        <Tooltip text="Campo obligatorio">
          <Text
            style={styles.asterisk}
            accessibilityLabel="Campo obligatorio"
            {...(Platform.OS === "web"
              ? ({ title: "Campo obligatorio", cursor: "help" } as any)
              : {})}
          >
            *
          </Text>
        </Tooltip>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 4 },
    asterisk: {
      fontSize: 14,
      fontWeight: "700",
      color: c.destructive,
      lineHeight: 14,
      paddingHorizontal: 2,
    },
  });
}
