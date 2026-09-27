import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

export type DetailField = { label: string; value: ReactNode };

// Read-only detail popup for catalog rows: shows the name, the full
// description that no longer lives in the table itself, and (via `fields`)
// any other attribute the grid row already shows — a "Ver" popup should
// never show less than the grid it opens from.
export function DetailModal({
  visible,
  onClose,
  title,
  description,
  fields,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string | null;
  fields?: DetailField[];
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>

          {fields && fields.length > 0 && (
            <View style={styles.fieldsRow}>
              {fields.map((f) => (
                <View key={f.label} style={styles.fieldCell}>
                  <Text style={styles.label}>{f.label}</Text>

                  {typeof f.value === "string" ? (
                    <Text style={styles.fieldValue}>{f.value}</Text>
                  ) : (
                    f.value
                  )}
                </View>
              ))}
            </View>
          )}

          <Text style={styles.label}>Descripción</Text>

          <ScrollView style={styles.descScroll}>
            <Text style={styles.desc}>
              {description?.trim() ? description : "Sin descripción."}
            </Text>
          </ScrollView>

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      padding: 20,
    },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      padding: 24,
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 8,
    },
    fieldsRow: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
    fieldCell: { minWidth: 90 },
    fieldValue: { fontSize: 14, color: c.text },
    descScroll: { maxHeight: 240 },
    desc: { fontSize: 14, color: c.textLabel, lineHeight: 20 },
    closeButton: {
      marginTop: 24,
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    closeText: { color: "#fff", fontWeight: "600" },
  });
}
