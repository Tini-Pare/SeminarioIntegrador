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

export type SelectOption<T extends number | string = number> = { value: T; label: string };

// Strict dropdown: the value can only ever be one of `options` (or null).
// Unlike AutocompleteInput there's no free-text entry — the search box only
// filters the list, the value still has to be picked from it (the field is
// a foreign key that must reference an existing row).
//
// Open state can be controlled from the parent (pass `open` + `onOpenChange`)
// so sibling dropdowns in the same form close each other; otherwise it's
// self-managed.
export function Select<T extends number | string = number>({
  value,
  onChange,
  options,
  placeholder = "Elegí una opción",
  disabled = false,
  open: openProp,
  onOpenChange,
  hasError = false,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
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

  const [query, setQuery] = useState("");
  const [flipVertical, setFlipVertical] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const controlRef = useRef<View>(null);

  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const styles = makeStyles(colors, flipVertical);

  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (open) {
      setQuery("");
      const t = setTimeout(() => searchRef.current?.focus(), 50);

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

      return () => clearTimeout(t);
    }
  }, [open, windowHeight]);

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <View ref={controlRef} style={[styles.wrap, open && styles.wrapOpen]}>
      <Pressable
        style={[styles.control, disabled && styles.disabled, hasError && styles.controlError]}
        onPress={() => !disabled && setOpen(!open)}
      >
        <Text style={selected ? styles.valueText : styles.placeholderText} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>

        <Text style={styles.chevron}>{open ? "▲" : "▼"}</Text>
      </Pressable>

      {open && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />

          <View style={styles.dropdown}>
            <TextInput
              ref={searchRef}
              style={styles.search}
              placeholder="Buscar…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />

            {filtered.length === 0 ? (
              <Text style={styles.noResults}>Sin resultados</Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="always" nestedScrollEnabled>
                {filtered.map((opt) => (
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
            )}
          </View>
        </>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors, flipVertical: boolean) {
  return StyleSheet.create({
    // Closed fields stay above the backdrop so a single tap on a sibling
    // dropdown's control switches to it (instead of the first tap only
    // dismissing the one that was open).
    wrap: { position: "relative", zIndex: 40 },
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
    controlError: {
      borderColor: c.destructive,
      borderWidth: 1.5,
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
    search: {
      height: 40,
      paddingHorizontal: 12,
      margin: 6,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 8,
      backgroundColor: c.bgInput,
      fontSize: 13.5,
      color: c.text,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}),
    },
    noResults: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: c.textMuted },
    option: { paddingHorizontal: 14, paddingVertical: 10 },
    optionText: { fontSize: 13.5, color: c.text },
    optionTextActive: { fontWeight: "700", color: c.accent },
  });
}
