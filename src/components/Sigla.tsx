import { useState } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import { SIGLAS } from "../lib/acronyms";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

// A sigla inside running text ("Todas las <Sigla>OT</Sigla> generadas") that
// shows its meaning on hover. Unlike Tooltip, which wraps a whole button in
// a View, this stays a nested Text so it can sit mid-sentence without
// breaking the line. The meaning comes from SIGLAS (lib/acronyms.ts).
// Hover only exists on web, so native renders plain text.
export function Sigla({ children }: { children: string }) {
  const [visible, setVisible] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const text = SIGLAS[children];

  if (!text || Platform.OS !== "web") return <Text>{children}</Text>;

  return (
    <Text
      style={styles.sigla}
      accessibilityLabel={`${children} (${text})`}
      // @ts-expect-error onMouseEnter/onMouseLeave are forwarded on web
      // (react-native-web's Text passes mouse props through to the span).
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}

      {visible && <Text style={styles.tooltip}>{text}</Text>}
    </Text>
  );
}

// Word-like siglas only, so a future entry with spaces or punctuation
// is never matched inside free text by accident.
const WORD_SIGLAS = Object.keys(SIGLAS).filter((k) => /^\w+$/.test(k));
const SIGLA_PATTERN = new RegExp(`\\b(${WORD_SIGLAS.join("|")})\\b`, "g");

// For text that isn't written in the code but comes from the DB (e.g. a
// solicitud's motivo de cierre "Se resolvió sin OT"): wraps every known
// sigla in it with <Sigla>. Render the result inside a <Text>.
export function withSiglas(text: string) {
  const parts = text.split(SIGLA_PATTERN);
  if (parts.length === 1) return text;
  // split() with a capture group puts the matched siglas at odd indexes.
  return parts.map((part, i) => (i % 2 === 1 ? <Sigla key={i}>{part}</Sigla> : part));
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    sigla: {
      position: "relative",
    },
    // Nested Text inherits the parent's font, so every text property is
    // reset here — otherwise a sigla inside a bold white button label would
    // render its tooltip bold, white and uppercase too.
    tooltip: {
      position: "absolute",
      bottom: "100%",
      left: 0,
      marginBottom: 6,
      zIndex: 9999,
      backgroundColor: c.text,
      color: c.bgCard,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      fontSize: 11,
      fontWeight: "600",
      fontStyle: "normal",
      letterSpacing: 0,
      lineHeight: 15,
      textTransform: "none",
      textDecorationLine: "none",
      textAlign: "left",
      ...(Platform.OS === "web"
        ? ({
            width: "max-content",
            maxWidth: 280,
            whiteSpace: "normal",
            pointerEvents: "none",
            fontFamily: "system-ui, sans-serif",
          } as object)
        : {}),
    },
  });
}
