import { useState } from "react";
import { View, TextInput, Pressable, Text, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

export function AutocompleteInput({
  value,
  onChangeText,
  options,
  placeholder,
}: {
  value: string;
  onChangeText: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const q = value.trim().toLowerCase();
  const distinct = [...new Set(options)].sort((a, b) => a.localeCompare(b));
  const filtered = (
    q ? distinct.filter((o) => o.toLowerCase().includes(q) && o.toLowerCase() !== q) : distinct
  ).slice(0, 8);

  return (
    <View style={[styles.wrap, focused && styles.wrapFocused]}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />

      {focused && filtered.length > 0 && (
        <View style={styles.dropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {filtered.map((opt) => (
              <Pressable
                key={opt}
                style={styles.option}
                onPress={() => {
                  onChangeText(opt);
                  setFocused(false);
                }}
              >
                <Text style={styles.optionText}>{opt}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { position: "relative", zIndex: 1 },
    wrapFocused: { zIndex: 50 },
    input: {
      height: 44,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      fontSize: 14,
      backgroundColor: c.bgInput,
      color: c.text,
    },
    dropdown: {
      position: "absolute",
      top: 47,
      left: 0,
      right: 0,
      backgroundColor: c.bgModal,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      maxHeight: 190,
      overflow: "hidden",
      zIndex: 20,
    },
    option: { paddingHorizontal: 14, paddingVertical: 10 },
    optionText: { fontSize: 13.5, color: c.text },
  });
}
