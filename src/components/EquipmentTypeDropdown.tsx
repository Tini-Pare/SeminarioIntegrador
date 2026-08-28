import { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
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
  onChange: (type: TipoEquipo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );
  const anchorRef = useRef<View>(null);
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const styles = makeStyles(colors);
  const dropdownHeight = Math.min(Math.max(types.length * 44 + 2, 46), 280);

  function toggleDropdown() {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }

  return (
    <View ref={anchorRef} style={[styles.wrap, open && styles.wrapOpen]}>
      <Pressable
        accessibilityLabel="Seleccionar tipo de equipo"
        accessibilityRole="button"
        style={styles.select}
        onPress={toggleDropdown}
      >
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value || "Seleccioná un tipo de equipo"}
        </Text>
        <Text style={styles.arrow}>{open ? "▴" : "▾"}</Text>
      </Pressable>

      {open && (
        <Modal transparent visible animationType="none" onRequestClose={() => setOpen(false)}>
          <View style={styles.modalLayer}>
            <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />

            <View
              style={[
                styles.dropdown,
                {
                  top: (anchor?.y ?? 60) + (anchor?.height ?? 44) + 4,
                  left: Math.max(
                    12,
                    Math.min(anchor?.x ?? 12, windowWidth - (anchor?.width ?? 260) - 12),
                  ),
                  width: Math.min(anchor?.width ?? windowWidth - 24, windowWidth - 24),
                  height: dropdownHeight,
                },
              ]}
            >
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
                        onChange(type);
                        setOpen(false);
                      }}
                    >
                      <Text style={styles.optionText}>{type.te_nombre}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { position: "relative", zIndex: 1 },
    wrapOpen: { zIndex: 10000, elevation: 100 },
    modalLayer: { flex: 1 },
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
    modalBackdrop: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "transparent",
    },
    dropdown: {
      position: "absolute",
      backgroundColor: c.bgModal,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      overflow: "hidden",
      zIndex: 2,
      elevation: 100,
    },
    optionsScroll: { flex: 1 },
    option: { paddingHorizontal: 14, paddingVertical: 10 },
    optionSelected: { backgroundColor: c.bgToggleActive },
    optionText: { color: c.text, fontSize: 13.5, fontWeight: "600" },
    empty: { padding: 14, color: c.textMuted, fontSize: 13 },
  });
}
