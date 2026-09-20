import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";
import { EyeIcon, PencilIcon, TrashIcon } from "./icons";
import { Tooltip } from "./Tooltip";

// Edit / delete buttons shown at the end of every catalog table row, so the
// two actions are always in the same place and easy to find. An optional
// view button is prepended when `onView` is given.
export function RowActions({
  onView,
  onEdit,
  onDelete,
  deleteDisabled = false,
  viewTooltip = "Ver detalle",
  editTooltip = "Editar",
  deleteTooltip = "Eliminar",
}: {
  onView?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  viewTooltip?: string;
  editTooltip?: string;
  deleteTooltip?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [hoverView, setHoverView] = useState(false);
  const [hoverEdit, setHoverEdit] = useState(false);
  const [hoverDelete, setHoverDelete] = useState(false);

  return (
    <View style={styles.wrap}>
      {onView && (
        <Tooltip text={viewTooltip}>
          <Pressable
            style={[styles.button, hoverView && styles.buttonViewHover]}
            onPress={onView}
            onHoverIn={() => setHoverView(true)}
            onHoverOut={() => setHoverView(false)}
            hitSlop={6}
            accessibilityLabel={viewTooltip}
          >
            <EyeIcon size={16} color={colors.accent} />
          </Pressable>
        </Tooltip>
      )}

      <Tooltip text={editTooltip}>
        <Pressable
          style={[styles.button, hoverEdit && styles.buttonEditHover]}
          onPress={onEdit}
          onHoverIn={() => setHoverEdit(true)}
          onHoverOut={() => setHoverEdit(false)}
          hitSlop={6}
          accessibilityLabel={editTooltip}
        >
          <PencilIcon size={16} color={colors.accent} />
        </Pressable>
      </Tooltip>

      <Tooltip text={deleteTooltip} align="right">
        <Pressable
          style={[
            styles.button,
            hoverDelete && !deleteDisabled && styles.buttonDeleteHover,
            deleteDisabled && styles.disabled,
          ]}
          onPress={onDelete}
          onHoverIn={() => setHoverDelete(true)}
          onHoverOut={() => setHoverDelete(false)}
          disabled={deleteDisabled}
          hitSlop={6}
          accessibilityLabel={deleteTooltip}
        >
          <TrashIcon size={16} color={colors.destructive} />
        </Pressable>
      </Tooltip>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { flexDirection: "row", gap: 6 },
    button: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
    },
    buttonViewHover: {
      backgroundColor: c.eqOperational.bg,
      borderColor: c.accent,
    },
    buttonEditHover: {
      backgroundColor: c.eqOperational.bg,
      borderColor: c.accent,
    },
    buttonDeleteHover: {
      backgroundColor: c.eqRepair.bg,
      borderColor: c.destructive,
    },
    disabled: { opacity: 0.35 },
  });
}
