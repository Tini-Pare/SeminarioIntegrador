import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { Profile } from "../types/database";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export const ROLE_LABELS: Record<Profile["role"], string> = {
  user: "Usuario",
  technician: "Técnico",
  admin: "Administrador",
};

const ROLES: Profile["role"][] = ["user", "technician", "admin"];

export function RoleDropdown({
  value,
  onChange,
}: {
  value: Profile["role"];
  onChange: (role: Profile["role"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={[styles.wrap, open && styles.wrapOpen]}>
      <Pressable
        accessibilityLabel="Seleccionar rol"
        accessibilityRole="button"
        style={styles.select}
        onPress={() => setOpen((current) => !current)}
      >
        <Text style={styles.value}>{ROLE_LABELS[value]}</Text>
        <Text style={styles.arrow}>{open ? "▴" : "▾"}</Text>
      </Pressable>

      {open && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

          <View style={styles.dropdown}>
            {ROLES.map((role) => (
              <Pressable
                key={role}
                style={[styles.option, role === value && styles.optionSelected]}
                onPress={() => {
                  onChange(role);
                  setOpen(false);
                }}
              >
                <Text style={styles.optionText}>{ROLE_LABELS[role]}</Text>
              </Pressable>
            ))}
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
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
    },
    value: { color: c.text, fontSize: 14 },
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
    option: { paddingHorizontal: 14, paddingVertical: 12 },
    optionSelected: { backgroundColor: c.bgToggleActive },
    optionText: { color: c.text, fontSize: 14 },
  });
}
