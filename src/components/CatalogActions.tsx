import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import { EditIcon, TrashIcon } from "./icons";

export function CatalogActions({
  active,
  disabled = false,
  onEdit,
  onToggle,
}: {
  active: boolean;
  disabled?: boolean;
  onEdit?: () => void;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = makeStyles();
  const toggleColor = active ? colors.destructive : colors.success;

  return (
    <View style={styles.actions}>
      {onEdit && (
        <Pressable
          accessibilityLabel="Editar"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onEdit}
          style={({ pressed }) => [
            styles.button,
            pressed && { backgroundColor: `${colors.accent}18` },
          ]}
        >
          <EditIcon size={17} color={colors.accent} />
        </Pressable>
      )}

      <Pressable
        accessibilityLabel={active ? "Inhabilitar" : "Habilitar"}
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={8}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.button,
          pressed && { backgroundColor: `${toggleColor}18` },
          disabled && styles.disabled,
        ]}
      >
        <TrashIcon size={17} color={toggleColor} />
      </Pressable>
    </View>
  );
}

function makeStyles() {
  return StyleSheet.create({
    actions: { flexDirection: "row", alignItems: "center", gap: 2 },
    button: {
      width: 34,
      height: 34,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: { opacity: 0.4 },
  });
}
