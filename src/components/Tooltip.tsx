import React, { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export function Tooltip({
  text,
  children,
  align = "center",
}: {
  text: string;
  children: React.ReactNode;
  // "right" keeps the tooltip from overflowing past a container that clips
  // overflow (e.g. a table's rounded corners) when the trigger sits at the
  // right edge, like the last action in a row of buttons.
  align?: "center" | "right";
}) {
  const [visible, setVisible] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (Platform.OS !== "web") {
    return <>{children}</>;
  }

  return (
    <View
      style={[styles.container, align === "right" && styles.containerAlignRight]}
      // @ts-expect-error onMouseEnter and onMouseLeave are supported on Web.
      // A nested Pressable here (with onHoverIn/onHoverOut) missed hover
      // events because its bounds exactly overlap the child button's own
      // Pressable, so only the innermost one reliably fired.
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}

      {visible && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{text}</Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
    },
    containerAlignRight: {
      alignItems: "flex-end",
    },
    tooltip: {
      position: "absolute",
      bottom: "100%",
      marginBottom: 6,
      backgroundColor: c.text,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      zIndex: 9999,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 3,
      ...(Platform.OS === "web"
        ? ({
            width: "max-content",
            whiteSpace: "nowrap",
          } as any)
        : {}),
    },
    tooltipText: {
      color: c.bgCard,
      fontSize: 11,
      fontWeight: "600",
    },
  });
}
