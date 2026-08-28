import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

export type EquipmentOption = {
  id: number;
  code: string;
  name: string;
  location: string;
};

export function EquipmentDropdown({
  value,
  options,
  onChange,
}: {
  value: number | undefined;
  options: EquipmentOption[];
  onChange: (equipment: EquipmentOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const selected = options.find((equipment) => equipment.id === value);
  const dropdownHeight = Math.min(Math.max(options.length * 56 + 2, 58), 280);

  return (
    <View style={[styles.wrap, open && styles.wrapOpen]}>
      <Pressable
        accessibilityLabel="Seleccionar equipo"
        accessibilityRole="button"
        style={styles.select}
        onPress={() => setOpen((current) => !current)}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? `${selected.code} · ${selected.name}` : "Seleccioná un equipo"}
        </Text>
        <Text style={styles.arrow}>{open ? "▴" : "▾"}</Text>
      </Pressable>

      {open && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

          <View style={[styles.dropdown, { height: dropdownHeight }]}>
            {options.length === 0 ? (
              <Text style={styles.empty}>No hay equipos activos.</Text>
            ) : (
              <ScrollView
                style={styles.optionsScroll}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {options.map((equipment) => (
                  <Pressable
                    key={equipment.id}
                    style={[styles.option, value === equipment.id && styles.optionSelected]}
                    onPress={() => {
                      onChange(equipment);
                      setOpen(false);
                    }}
                  >
                    <Text style={styles.optionName}>
                      {equipment.code} · {equipment.name}
                    </Text>
                    <Text style={styles.optionLocation}>{equipment.location}</Text>
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
    backdrop: {
      position: Platform.OS === "web" ? "fixed" : "absolute",
      top: Platform.OS === "web" ? 0 : -1000,
      left: Platform.OS === "web" ? 0 : -1000,
      right: Platform.OS === "web" ? 0 : -1000,
      bottom: Platform.OS === "web" ? 0 : -1000,
      zIndex: 999,
      backgroundColor: "transparent",
    },
    optionsScroll: { flex: 1 },
    option: { paddingHorizontal: 14, paddingVertical: 10 },
    optionSelected: { backgroundColor: c.bgToggleActive },
    optionName: { color: c.text, fontSize: 13.5, fontWeight: "600" },
    optionLocation: { color: c.textMuted, fontSize: 12, marginTop: 3 },
    empty: { padding: 14, color: c.textMuted, fontSize: 13 },
  });
}
