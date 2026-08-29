import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";
import { PencilIcon, TrashIcon } from "./icons";

// Edit / delete buttons shown at the end of every catalog table row, so the
// two actions are always in the same place and easy to find.
export function RowActions({
  onEdit,
  onDelete,
  deleteDisabled = false,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.button} onPress={onEdit} hitSlop={6} accessibilityLabel="Editar">
        <PencilIcon size={16} color={colors.accent} />
      </Pressable>

      <Pressable
        style={[styles.button, deleteDisabled && styles.disabled]}
        onPress={onDelete}
        disabled={deleteDisabled}
        hitSlop={6}
        accessibilityLabel="Eliminar"
      >
        <TrashIcon size={16} color={colors.destructive} />
      </Pressable>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { flexDirection: "row", gap: 4 },
    button: {
      width: 34,
      height: 34,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgNested,
      borderWidth: 1,
      borderColor: c.border,
    },
    disabled: { opacity: 0.35 },
  });
}
