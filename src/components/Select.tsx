import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export type SelectOption = { value: number; label: string };

// Strict dropdown: the value can only ever be one of `options` (or null).
// Unlike AutocompleteInput there's no free-text entry — used where the field
// is a foreign key that must reference an existing row.
//
// Open state can be controlled from the parent (pass `open` + `onOpenChange`)
// so sibling dropdowns in the same form close each other; otherwise it's
// self-managed.
export function Select({
  value,
  onChange,
  options,
  placeholder = "Elegí una opción",
  disabled = false,
  open: openProp,
  onOpenChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [openState, setOpenState] = useState(false);
  const controlled = onOpenChange !== undefined;
  const open = controlled ? !!openProp : openState;
  const setOpen = (v: boolean) => (controlled ? onOpenChange!(v) : setOpenState(v));

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <View style={[styles.wrap, open && styles.wrapOpen]}>
      <Pressable
        style={[styles.control, disabled && styles.disabled]}
        onPress={() => !disabled && setOpen(!open)}
      >
        <Text style={selected ? styles.valueText : styles.placeholderText} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>

        <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      {open && options.length > 0 && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

          <View style={styles.dropdown}>
            <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {options.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={styles.option}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[styles.optionText, opt.value === value && styles.optionTextActive]}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { position: "relative", zIndex: 1 },
    wrapOpen: { zIndex: 100 },
    control: {
      height: 44,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    disabled: { opacity: 0.45 },
    valueText: { flex: 1, fontSize: 14, color: c.text },
    placeholderText: { flex: 1, fontSize: 14, color: c.textMuted },
    chevron: { fontSize: 10, color: c.textMuted },
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
      maxHeight: 190,
      overflow: "hidden",
      zIndex: 1000,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 5,
      elevation: 5,
      ...(Platform.OS === "web" ? { boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.3)" } : {}),
    },
    option: { paddingHorizontal: 14, paddingVertical: 10 },
    optionText: { fontSize: 13.5, color: c.text },
    optionTextActive: { fontWeight: "700", color: c.accent },
  });
}
