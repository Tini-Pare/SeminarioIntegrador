import { Alert, Platform } from "react-native";

// Cross-platform delete confirmation. On web there's no Alert dialog, so
// fall back to window.confirm; on native use the destructive Alert.
export function confirmDelete(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: "Eliminar", style: "destructive", onPress: onConfirm },
  ]);
}
