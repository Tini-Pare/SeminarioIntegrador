import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import { CheckIcon } from "./icons";

export type Step = {
  label: string;
  state: "done" | "current" | "upcoming";
  // Only used on a done step: lets the user go back to it.
  onPress?: () => void;
};

// "① Tipo de comprobante —— ② Datos y detalle": a numbered dot per step
// (a check once done) joined by a line that fills in as steps are done.
// Shared by multi-step flows (Registrar compra; Solicitud → OT → Tareas)
// so they all read the same.
export function StepIndicator({
  steps,
  style,
  compact = false,
}: {
  steps: Step[];
  style?: StyleProp<ViewStyle>;
  // Tighter spacing, shorter lines and a smaller label, so three steps fit
  // on one line inside a narrow modal.
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={[styles.steps, compact && styles.stepsCompact, style]}>
      {steps.map((step, i) => {
        const reached = step.state !== "upcoming";
        return (
          <View key={step.label} style={[styles.stepWithLine, compact && styles.gapCompact]}>
            {i > 0 && (
              <View
                style={[
                  styles.stepLine,
                  compact && styles.stepLineCompact,
                  reached && styles.stepLineActive,
                ]}
              />
            )}

            <Pressable
              style={[styles.stepItem, compact && styles.gapCompact]}
              onPress={step.onPress}
              disabled={!step.onPress || step.state !== "done"}
              accessibilityLabel={`Paso ${i + 1}: ${step.label}${
                step.state === "done" ? " (completo)" : step.state === "current" ? " (actual)" : ""
              }`}
            >
              <View style={[styles.stepDot, reached && styles.stepDotActive]}>
                {step.state === "done" ? (
                  <CheckIcon size={13} color="#fff" />
                ) : (
                  <Text style={[styles.stepDotText, reached && styles.stepDotTextActive]}>
                    {i + 1}
                  </Text>
                )}
              </View>

              <Text
                style={[
                  styles.stepLabel,
                  compact && styles.stepLabelCompact,
                  reached && styles.stepLabelActive,
                ]}
              >
                {step.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    steps: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: 10,
      rowGap: 8,
    },
    stepsCompact: { columnGap: 6 },
    stepWithLine: { flexDirection: "row", alignItems: "center", gap: 10 },
    gapCompact: { gap: 6 },
    stepItem: { flexDirection: "row", alignItems: "center", gap: 8 },
    stepDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.bgNested,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.borderInput,
    },
    stepDotActive: { backgroundColor: c.accent, borderColor: c.accent },
    stepDotText: { fontSize: 12, fontWeight: "700", color: c.textMuted },
    stepDotTextActive: { color: "#fff" },
    stepLabel: { fontSize: 13.5, fontWeight: "500", color: c.textMuted },
    stepLabelCompact: { fontSize: 12.5 },
    stepLabelActive: { color: c.text, fontWeight: "700" },
    stepLine: { width: 32, height: 2, backgroundColor: c.border },
    stepLineCompact: { width: 14 },
    stepLineActive: { backgroundColor: c.accent },
  });
}
