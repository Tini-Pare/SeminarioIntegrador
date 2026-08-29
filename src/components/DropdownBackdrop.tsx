import { Platform, Pressable, StyleSheet } from "react-native";

// One shared click-catcher for a form that has several dropdowns sharing a
// single "which field is open" state. Sits below the field controls
// (zIndex 20 vs the fields' 40+) so a tap on another dropdown's control
// opens it in a single click, while a tap anywhere else closes whatever is
// open. Each Select/CustomDatePicker skips its own backdrop when its open
// state is controlled by the parent.
export function DropdownBackdrop({ open, onPress }: { open: boolean; onPress: () => void }) {
  if (!open) return null;
  return <Pressable style={styles.backdrop} onPress={onPress} />;
}

const styles = StyleSheet.create({
  backdrop: {
    position: Platform.OS === "web" ? "fixed" : "absolute",
    top: Platform.OS === "web" ? 0 : -1000,
    left: Platform.OS === "web" ? 0 : -1000,
    right: Platform.OS === "web" ? 0 : -1000,
    bottom: Platform.OS === "web" ? 0 : -1000,
    zIndex: 20,
    backgroundColor: "transparent",
  },
});
