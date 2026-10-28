import { useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
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
  // The "Campo obligatorio" popup opens beside the asterisk (upward it
  // would land on the field above, often a Select with zIndex 40), and the
  // row rises over its siblings while it shows.
  const [tooltipOpen, setTooltipOpen] = useState(false);
  // The label's margins go on the row, so the asterisk lines up with the
  // text instead of with the text plus its margins.
  const { marginTop, marginBottom, ...textStyle } = StyleSheet.flatten(style) ?? {};

  return (
    <View style={[styles.row, { marginTop, marginBottom }, tooltipOpen && styles.rowRaised]}>
      <Text style={textStyle}>{text}</Text>

      {required && (
        <Tooltip text="Campo obligatorio" placement="right" onVisibleChange={setTooltipOpen}>
          <Text style={styles.asterisk} accessibilityLabel="Campo obligatorio">
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
    rowRaised: { zIndex: 200 },
    asterisk: {
      fontSize: 14,
      fontWeight: "700",
      color: c.destructive,
      lineHeight: 14,
      paddingHorizontal: 2,
    },
  });
}
