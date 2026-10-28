import React, { useState } from "react";
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export function Tooltip({
  text,
  children,
  align = "center",
  placement = "top",
  style,
  onVisibleChange,
}: {
  text: string;
  children: React.ReactNode;
  // "right" keeps the tooltip from overflowing past a container that clips
  // overflow (e.g. a table's rounded corners) when the trigger sits at the
  // right edge, like the last action in a row of buttons.
  align?: "center" | "right";
  // "left"/"right" open it beside the trigger instead of above: for a
  // trigger at the top-right corner of a clipping container (a panel's first
  // row), or a form label whose field above would cover an upward popup.
  placement?: "top" | "left" | "right";
  // Layout overrides for the wrapper, e.g. alignSelf when the parent row
  // would otherwise stretch it to its full height.
  style?: StyleProp<ViewStyle>;
  // react-native-web gives every View its own stacking context, so the
  // popup can't rise above an earlier sibling with a zIndex (a Select
  // field): the parent uses this to raise itself while it shows.
  onVisibleChange?: (visible: boolean) => void;
}) {
  const [visible, setVisibleState] = useState(false);
  const setVisible = (v: boolean) => {
    setVisibleState(v);
    onVisibleChange?.(v);
  };
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (Platform.OS !== "web") {
    return <>{children}</>;
  }

  return (
    <View
      style={[
        styles.container,
        align === "right" && styles.containerAlignRight,
        visible && styles.containerRaised,
        style,
      ]}
      // @ts-expect-error onMouseEnter and onMouseLeave are supported on Web.
      // A nested Pressable here (with onHoverIn/onHoverOut) missed hover
      // events because its bounds exactly overlap the child button's own
      // Pressable, so only the innermost one reliably fired.
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      // A click hides it: when the press navigates, the old screen stays
      // mounted (hidden) under the stack and mouseleave never fires, so the
      // tooltip was still showing on the way back. Same for a tap on a
      // touch screen, which fires mouseenter but no mouseleave.
      onClick={() => setVisible(false)}
    >
      {children}

      {visible && (
        <View
          style={[
            styles.tooltip,
            placement === "left" && styles.tooltipLeft,
            placement === "right" && styles.tooltipRight,
          ]}
        >
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
    // Above its own siblings (e.g. the next button in a row) while it shows.
    containerRaised: {
      zIndex: 9999,
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
      // Only informative: never catches the click meant for what's under it.
      pointerEvents: "none",
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
    tooltipLeft: {
      bottom: undefined,
      marginBottom: 0,
      right: "100%",
      marginRight: 6,
    },
    tooltipRight: {
      bottom: undefined,
      marginBottom: 0,
      left: "100%",
      marginLeft: 6,
    },
    tooltipText: {
      color: c.bgCard,
      fontSize: 11,
      fontWeight: "600",
    },
  });
}
