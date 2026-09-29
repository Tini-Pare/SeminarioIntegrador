import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export type TaskOption = { value: number; label: string };

// Combobox for tasks: allows selecting an existing generic task from the catalog
// or typing a custom task name by hand directly into the text input.
export function TaskCombobox({
  value,
  onChangeText,
  options,
  onSelectOption,
  placeholder = "Escribí o elegí una tarea",
  disabled = false,
  open: openProp,
  onOpenChange,
  hasError = false,
}: {
  value: string;
  onChangeText: (text: string) => void;
  options: TaskOption[];
  onSelectOption?: (option: TaskOption) => void;
  placeholder?: string;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hasError?: boolean;
}) {
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? !!openProp : openState;
  const setOpen = (v: boolean) => {
    if (controlled) {
      onOpenChange?.(v);
    } else {
      setOpenState(v);
    }
  };

  const [flipVertical, setFlipVertical] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const controlRef = useRef<View>(null);

  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const styles = makeStyles(colors, flipVertical);

  useEffect(() => {
    if (open) {
      if (
        Platform.OS === "web" &&
        typeof (controlRef.current as any)?.getBoundingClientRect === "function"
      ) {
        const rect = (controlRef.current as any).getBoundingClientRect();
        const spaceBelow = windowHeight - rect.bottom;
        const dropdownHeight = 240;
        setFlipVertical(spaceBelow < dropdownHeight && rect.top > dropdownHeight);
      } else {
        controlRef.current?.measure((x, y, width, height, pageX, pageY) => {
          const dropdownHeight = 240;
          const spaceBelow = windowHeight - (pageY ?? 0) - (height ?? 44);
          if (spaceBelow < dropdownHeight && (pageY ?? 0) > dropdownHeight) {
            setFlipVertical(true);
          } else {
            setFlipVertical(false);
          }
        });
      }
    }
  }, [open, windowHeight]);

  const q = value.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const exactMatch = options.some((o) => o.label.trim().toLowerCase() === q);
  const showManualOption = q.length > 0 && !exactMatch;

  function handleSelect(opt: TaskOption) {
    onChangeText(opt.label);
    onSelectOption?.(opt);
    setOpen(false);
  }

  function handleUseManual() {
    setOpen(false);
  }

  return (
    <View ref={controlRef} style={[styles.wrap, open && styles.wrapOpen]}>
      <View
        style={[
          styles.control,
          disabled && styles.disabled,
          hasError && styles.controlError,
          open && styles.controlFocused,
        ]}
      >
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={(txt) => {
            onChangeText(txt);
            if (!open) setOpen(true);
          }}
          onFocus={() => !disabled && setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          editable={!disabled}
          autoCorrect={false}
        />

        <Pressable
          style={styles.chevronButton}
          onPress={() => {
            if (disabled) return;
            setOpen(!open);
            if (!open) {
              inputRef.current?.focus();
            }
          }}
          hitSlop={8}
        >
          <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
        </Pressable>
      </View>

      {open && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

          <View style={styles.dropdown}>
            <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled>
              {showManualOption && (
                <Pressable style={styles.manualOption} onPress={handleUseManual}>
                  <Text style={styles.manualOptionPrefix}>➕ Usar tarea manual:</Text>

                  <Text style={styles.manualOptionName} numberOfLines={1}>
                    "{value.trim()}"
                  </Text>
                </Pressable>
              )}

              {filtered.length === 0 && !showManualOption ? (
                <Text style={styles.noResults}>Sin sugerencias (se guardará lo escrito)</Text>
              ) : (
                filtered.map((opt) => {
                  const isSelected = opt.label.trim().toLowerCase() === q;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.option, isSelected && styles.optionActive]}
                      onPress={() => handleSelect(opt)}
                    >
                      <Text
                        style={[styles.optionText, isSelected && styles.optionTextActive]}
                        numberOfLines={1}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors, flipVertical: boolean) {
  return StyleSheet.create({
    wrap: { position: "relative", zIndex: 40 },
    wrapOpen: { zIndex: 100 },
    control: {
      height: 44,
      paddingLeft: 14,
      paddingRight: 8,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    controlFocused: {
      borderColor: c.accent,
    },
    controlError: {
      borderColor: c.destructive,
      borderWidth: 1.5,
    },
    disabled: { opacity: 0.45 },
    input: {
      flex: 1,
      height: 42,
      fontSize: 14,
      color: c.text,
      padding: 0,
      margin: 0,
      borderWidth: 0,
      backgroundColor: "transparent",
      ...(Platform.OS === "web"
        ? ({
            outlineStyle: "none",
            outlineWidth: 0,
            borderStyle: "none",
          } as object)
        : {}),
    },
    chevronButton: {
      paddingHorizontal: 8,
      paddingVertical: 10,
      justifyContent: "center",
      alignItems: "center",
    },
    chevron: { fontSize: 10, color: c.textMuted },
    backdrop: {
      position: Platform.OS === "web" ? "fixed" : "absolute",
      top: Platform.OS === "web" ? 0 : -1000,
      left: Platform.OS === "web" ? 0 : -1000,
      right: Platform.OS === "web" ? 0 : -1000,
      bottom: Platform.OS === "web" ? 0 : -1000,
      zIndex: 90,
      backgroundColor: "transparent",
    },
    dropdown: {
      position: "absolute",
      top: flipVertical ? undefined : 48,
      bottom: flipVertical ? 48 : undefined,
      left: 0,
      right: 0,
      backgroundColor: c.bgModal,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      maxHeight: 230,
      overflow: "hidden",
      zIndex: 110,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 8,
      ...(Platform.OS === "web" ? { boxShadow: "0px 6px 16px rgba(0, 0, 0, 0.35)" } : {}),
    },
    manualOption: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: c.bgNested,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    manualOptionPrefix: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.accent,
    },
    manualOptionName: {
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    noResults: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: c.textMuted },
    option: { paddingHorizontal: 14, paddingVertical: 10 },
    optionActive: { backgroundColor: c.bgNested },
    optionText: { fontSize: 13.5, color: c.text },
    optionTextActive: { fontWeight: "700", color: c.accent },
  });
}
