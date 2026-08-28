import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TipoEquipo } from "../types/database";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export function EquipmentTypeDropdown({
  value,
  types,
  onChange,
}: {
  value: string;
  types: TipoEquipo[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const dropdownHeight = Math.min(Math.max(types.length * 44 + 2, 46), 280);

  return (
    <View style={[styles.wrap, open && styles.wrapOpen]}>
      <Pressable
        accessibilityLabel="Seleccionar tipo de equipo"
        accessibilityRole="button"
        style={styles.select}
        onPress={() => setOpen((current) => !current)}
      >
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value || "Seleccioná un tipo de equipo"}
        </Text>
        <Text style={styles.arrow}>{open ? "▴" : "▾"}</Text>
      </Pressable>

      {open && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

          <View style={[styles.dropdown, { height: dropdownHeight }]}>
            {types.length === 0 ? (
              <Text style={styles.empty}>No hay tipos de equipo cargados.</Text>
            ) : (
              <ScrollView
                style={styles.optionsScroll}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {types.map((type) => (
                  <Pressable
                    key={type.te_id}
                    style={[styles.option, value === type.te_nombre && styles.optionSelected]}
                    onPress={() => {
                      onChange(type.te_nombre);
                      setOpen(false);
                    }}
                  >
                    <Text style={styles.optionText}>{type.te_nombre}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { position: "relative", zIndex: 1 },
    wrapOpen: { zIndex: 1000, elevation: 50 },
    select: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
    },
    value: { flex: 1, color: c.text, fontSize: 14 },
    placeholder: { color: c.textMuted },
    arrow: { color: c.textMuted, fontSize: 15 },
    backdrop: {
      position: Platform.OS === "web" ? "fixed" : "absolute",
      top: Platform.OS === "web" ? 0 : -1000,
      left: Platform.OS === "web" ? 0 : -1000,
      right: Platform.OS === "web" ? 0 : -1000,
      bottom: Platform.OS === "web" ? 0 : -1000,
      zIndex: 999,
      backgroundColor: "transparent",
    },
    dropdown: {
      position: "absolute",
      top: 48,
      left: 0,
      right: 0,
      backgroundColor: c.bgModal,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      overflow: "hidden",
      zIndex: 1001,
      elevation: 20,
    },
    optionsScroll: { flex: 1 },
    option: { paddingHorizontal: 14, paddingVertical: 10 },
    optionSelected: { backgroundColor: c.bgToggleActive },
    optionText: { color: c.text, fontSize: 13.5, fontWeight: "600" },
    empty: { padding: 14, color: c.textMuted, fontSize: 13 },
  });
}
