import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { StatisticsPdfBlock } from "../../lib/statisticsPdf";
import type { ThemeColors } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { FormFooter } from "../FormFooter";
import { CheckIcon } from "../icons";

// Before exporting a tab to PDF the admin picks which of its blocks go in,
// for when only one or two of them matter. Every block starts checked, so
// confirming right away exports the whole tab as before.
export function ExportPdfModal({
  visible,
  tabLabel,
  blocks,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  tabLabel: string;
  blocks: StatisticsPdfBlock[];
  onClose: () => void;
  onConfirm: (keys: string[]) => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) setSelected(new Set(blocks.map((b) => b.key)));
  }, [visible, blocks]);

  const allSelected = selected.size === blocks.length;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Exportar a PDF</Text>

          <Text style={styles.subtitle}>{tabLabel}</Text>

          <View style={styles.listHeader}>
            <Text style={styles.label}>
              Bloques a incluir ({selected.size} de {blocks.length})
            </Text>

            <Pressable
              onPress={() =>
                setSelected(allSelected ? new Set() : new Set(blocks.map((b) => b.key)))
              }
              accessibilityRole="button"
            >
              <Text style={styles.link}>{allSelected ? "Quitar todos" : "Seleccionar todos"}</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.list}>
            {blocks.map((b) => {
              const checked = selected.has(b.key);
              return (
                <Pressable
                  key={b.key}
                  style={[styles.option, checked && styles.optionChecked]}
                  onPress={() => toggle(b.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={b.label}
                >
                  <View style={[styles.box, checked && styles.boxChecked]}>
                    {checked && <CheckIcon size={13} color="#fff" />}
                  </View>

                  <Text style={styles.optionText}>{b.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selected.size === 0 && (
            <Text style={styles.warning}>Elegí al menos un bloque para exportar.</Text>
          )}

          <FormFooter
            onCancel={onClose}
            // Keep the catalog's order, not the order they were ticked in.
            onConfirm={() => onConfirm(blocks.map((b) => b.key).filter((k) => selected.has(k)))}
            disabled={selected.size === 0}
          />
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
      maxWidth: 480,
      maxHeight: "90%",
      alignSelf: "center",
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    listHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 18,
      marginBottom: 10,
    },
    label: { fontSize: 12.5, fontWeight: "600", color: c.textLabel },
    link: { fontSize: 13, fontWeight: "500", color: c.accent },
    list: { flexGrow: 0 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      backgroundColor: c.bgCard,
      marginBottom: 8,
    },
    optionChecked: { borderColor: c.accent },
    box: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: c.borderInput,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#ffffff",
    },
    boxChecked: { backgroundColor: c.accent, borderColor: c.accent },
    optionText: { flex: 1, fontSize: 14, color: c.text },
    warning: { marginTop: 4, fontSize: 12.5, color: c.destructive },
  });
}
