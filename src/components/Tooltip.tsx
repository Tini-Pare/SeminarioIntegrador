import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (Platform.OS !== "web") {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <Pressable
        onHoverIn={() => setVisible(true)}
        onHoverOut={() => setVisible(false)}
        style={styles.trigger}
      >
        {children}
      </Pressable>

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
    trigger: {
      alignItems: "center",
      justifyContent: "center",
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
