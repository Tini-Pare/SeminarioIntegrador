import { useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { FunnelIcon, SearchIcon } from "./icons";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export type FilterOption = { value: string; label: string };

// One dropdown-less filter per attribute. `options[0]` is the "show all"
// entry -- its value is what "no filter" looks like, and the funnel badge
// counts every filter whose value differs from it.
export type FilterDef = {
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
};

export function TableFilterBar({
  filters,
  searchValue,
  onSearch,
  searchPlaceholder = "Buscar…",
  right,
}: {
  filters: FilterDef[];
  searchValue?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [open, setOpen] = useState(false);

  const activeCount = filters.filter((f) => f.value !== f.options[0]?.value).length;
  const hasActive = activeCount > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {onSearch && (
          <View style={styles.searchBox}>
            <SearchIcon size={15} color={colors.textMuted} />

            <TextInput
              style={styles.searchInput}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textMuted}
              value={searchValue}
              onChangeText={onSearch}
              autoCorrect={false}
            />
          </View>
        )}

        {filters.length > 0 && (
          <Pressable
            style={[styles.funnelBtn, (open || hasActive) && styles.funnelBtnActive]}
            onPress={() => setOpen((o) => !o)}
          >
            <FunnelIcon size={14} color={hasActive ? "#fff" : colors.textLabel} />

            <Text style={[styles.funnelText, hasActive && styles.funnelTextActive]}>
              {hasActive ? `Filtros (${activeCount})` : "Filtros"}
            </Text>
          </Pressable>
        )}

        <View style={styles.spacer} />

        {right}
      </View>

      {open && filters.length > 0 && (
        <View style={styles.panel}>
          {filters.map((f) => (
            <View key={f.key} style={styles.group}>
              <Text style={styles.groupLabel}>{f.label}</Text>

              <View style={styles.chips}>
                {f.options.map((o) => {
                  const active = o.value === f.value;
                  return (
                    <Pressable
                      key={o.value}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => f.onChange(o.value)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          {hasActive && (
            <Pressable
              style={styles.clearBtn}
              onPress={() => filters.forEach((f) => f.onChange(f.options[0].value))}
            >
              <Text style={styles.clearText}>Limpiar filtros</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { marginBottom: 14 },
    bar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
    spacer: { flex: 1, minWidth: 0 },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      maxWidth: 320,
      flexGrow: 1,
      minWidth: 180,
      height: 38,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 9,
      backgroundColor: c.bgCard,
    },
    searchInput: {
      flex: 1,
      height: "100%",
      fontSize: 13.5,
      color: c.text,
      padding: 0,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : {}),
    },
    funnelBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      height: 38,
      paddingHorizontal: 14,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgCard,
    },
    funnelBtnActive: { borderColor: c.accent, backgroundColor: c.accent },
    funnelText: { fontSize: 13, fontWeight: "600", color: c.textLabel },
    funnelTextActive: { color: "#fff" },
    panel: {
      marginTop: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      backgroundColor: c.bgCard,
      gap: 14,
    },
    group: { gap: 8 },
    groupLabel: {
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: c.textMuted,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    chip: {
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgStatCard,
    },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { fontSize: 12.5, fontWeight: "600", color: c.textLabel },
    chipTextActive: { color: "#fff" },
    clearBtn: { alignSelf: "flex-start" },
    clearText: { fontSize: 12.5, fontWeight: "600", color: c.accent },
  });
}
