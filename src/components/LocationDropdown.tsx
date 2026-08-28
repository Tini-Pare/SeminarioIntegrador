import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { LocationWithCount } from "../lib/queries/locations";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";

export function LocationDropdown({
  value,
  locations,
  onChange,
}: {
  value: string;
  locations: LocationWithCount[];
  onChange: (location: LocationWithCount) => void;
}) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const dropdownHeight = Math.min(Math.max(locations.length * 44 + 2, 46), 280);

  return (
    <View style={[styles.wrap, open && styles.wrapOpen]}>
      <Pressable
        accessibilityLabel="Seleccionar ubicación"
        accessibilityRole="button"
        style={styles.select}
        onPress={() => setOpen((current) => !current)}
      >
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value || "Seleccioná una ubicación"}
        </Text>
        <Text style={styles.arrow}>{open ? "▴" : "▾"}</Text>
      </Pressable>

      {open && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

          <View style={[styles.dropdown, { height: dropdownHeight }]}>
            {locations.length === 0 ? (
              <Text style={styles.empty}>No hay ubicaciones cargadas.</Text>
            ) : (
              <ScrollView
                style={styles.optionsScroll}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {locations.map((location) => (
                  <Pressable
                    key={location.lu_codigo}
                    style={[
                      styles.option,
                      value === location.lu_nombre_sector && styles.optionSelected,
                    ]}
                    onPress={() => {
                      onChange(location);
                      setOpen(false);
                    }}
                  >
                    <Text style={styles.optionName}>{location.lu_nombre_sector}</Text>
                    {!!location.lu_piso && (
                      <Text style={styles.optionFloor}>Piso {location.lu_piso}</Text>
                    )}
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
    wrapOpen: { zIndex: 10000, elevation: 100 },
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
      elevation: 100,
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
    option: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    optionSelected: { backgroundColor: c.bgToggleActive },
    optionName: { flex: 1, color: c.text, fontSize: 13.5, fontWeight: "600" },
    optionFloor: { color: c.textMuted, fontSize: 12, textAlign: "right" },
    empty: { padding: 14, color: c.textMuted, fontSize: 13 },
  });
}
