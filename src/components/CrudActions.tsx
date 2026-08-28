import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import { EditIcon, TrashIcon } from "./icons";

export function CrudActions({
  onEdit,
  onDelete,
  deleteDisabled = false,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = makeStyles();

  return (
    <View style={styles.actions}>
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

      <Pressable
        accessibilityLabel="Eliminar"
        accessibilityRole="button"
        disabled={deleteDisabled}
        hitSlop={8}
        onPress={onDelete}
        style={({ pressed }) => [
          styles.button,
          pressed && { backgroundColor: `${colors.destructive}18` },
          deleteDisabled && styles.disabled,
        ]}
      >
        <TrashIcon size={17} color={colors.destructive} />
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
