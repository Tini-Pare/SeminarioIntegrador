import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { addDays, type OrderTypeFilter, type StatsPeriod } from "../../lib/statistics";
import type { ThemeColors } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import {
  CustomDatePicker,
  fromDbDate,
  isValidDateString,
  parseDateString,
  toDay,
  toDbDate,
} from "../CustomDatePicker";

export type PeriodPreset = "7d" | "30d" | "90d" | "month" | "year" | "custom";

const PRESET_LABELS: Record<PeriodPreset, string> = {
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
  month: "Este mes",
  year: "Este año",
  custom: "Personalizado",
};

const TYPE_OPTIONS: { value: OrderTypeFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "correctivo", label: "Correctivas" },
  { value: "preventivo", label: "Preventivas" },
];

// The period a preset covers, ending today. "custom" keeps whatever the
// date pickers hold, so it isn't resolved here.
export function presetPeriod(preset: Exclude<PeriodPreset, "custom">, today: string): StatsPeriod {
  switch (preset) {
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "month":
      return { from: `${today.slice(0, 8)}01`, to: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

// One row above the charts: the period (Gaona: "información justa",
// filtered by date) and, on the tabs about OTs, correctivas/preventivas.
export function StatisticsFilters({
  preset,
  period,
  onPeriodChange,
  type,
  onTypeChange,
  showType,
  today,
}: {
  preset: PeriodPreset;
  period: StatsPeriod;
  onPeriodChange: (preset: PeriodPreset, period: StatsPeriod) => void;
  type: OrderTypeFilter;
  onTypeChange: (type: OrderTypeFilter) => void;
  showType: boolean;
  today: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [openPicker, setOpenPicker] = useState<"from" | "to" | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const maxDate = useMemo(() => parseDateString(fromDbDate(today)) ?? toDay(new Date()), [today]);
  const parsedFrom = useMemo(() => parseDateString(fromText), [fromText]);
  const parsedTo = useMemo(() => parseDateString(toText), [toText]);

  function pickPreset(p: PeriodPreset) {
    if (p === "custom") {
      if (preset !== "custom") {
        setFromText("");
        setToText("");
      }
      setRangeError(null);
      onPeriodChange("custom", period);
      return;
    }
    setOpenPicker(null);
    setRangeError(null);
    onPeriodChange(p, presetPeriod(p, today));
  }

  // Applies the custom range as soon as both dates are valid and in order.
  function applyCustom(nextFrom: string, nextTo: string) {
    if (!isValidDateString(nextFrom) || !isValidDateString(nextTo)) return;
    const from = toDbDate(nextFrom);
    const to = toDbDate(nextTo);
    if (from > to) {
      setRangeError("La fecha “desde” tiene que ser anterior a “hasta”.");
      return;
    }
    setRangeError(null);
    onPeriodChange("custom", { from, to });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.group}>
        <Text style={styles.groupLabel}>Período</Text>

        <View style={styles.chips}>
          {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((p) => (
            <Chip
              key={p}
              label={PRESET_LABELS[p]}
              active={preset === p}
              onPress={() => pickPreset(p)}
              styles={styles}
            />
          ))}
        </View>
      </View>

      {preset === "custom" && (
        <View style={[styles.customRow, openPicker && { zIndex: 30 }]}>
          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>Desde</Text>

            <CustomDatePicker
              value={fromText}
              onChange={(v) => {
                setFromText(v);
                const nextFrom = parseDateString(v);
                if (nextFrom && parsedTo && nextFrom.getTime() > parsedTo.getTime()) {
                  setToText("");
                  setRangeError(null);
                  return;
                }
                applyCustom(v, toText);
              }}
              open={openPicker === "from"}
              onOpenChange={(o) => setOpenPicker(o ? "from" : null)}
              maxDate={maxDate}
              compact
            />
          </View>

          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>Hasta</Text>

            <CustomDatePicker
              value={toText}
              onChange={(v) => {
                setToText(v);
                applyCustom(fromText, v);
              }}
              open={openPicker === "to"}
              onOpenChange={(o) => setOpenPicker(o ? "to" : null)}
              minDate={parsedFrom ?? undefined}
              maxDate={maxDate}
              compact
              // Opens leftwards: anchored left, its calendar would run off
              // the right edge of a phone.
              alignDropdown="right"
            />
          </View>

          {rangeError && <Text style={styles.error}>{rangeError}</Text>}
        </View>
      )}

      {showType && (
        <View style={styles.group}>
          <Text style={styles.groupLabel}>Tipo de orden de trabajo</Text>

          <View style={styles.chips}>
            {TYPE_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                active={type === o.value}
                onPress={() => onTypeChange(o.value)}
                styles={styles}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 16, zIndex: 10 },
    group: { gap: 6 },
    groupLabel: {
      fontSize: 11.5,
      fontWeight: "600",
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.textMuted,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
      paddingHorizontal: 12,
      height: 32,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      alignItems: "center",
      justifyContent: "center",
    },
    chipActive: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { fontSize: 13, fontWeight: "500", color: c.textLabel },
    chipTextActive: { color: "#fff", fontWeight: "600" },
    customRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 10 },
    // Shrinks below 150 so Desde and Hasta stay side by side on a narrow phone.
    dateField: { gap: 6, width: 150, flexShrink: 1, minWidth: 0 },
    dateLabel: { fontSize: 12, fontWeight: "500", color: c.textSecondary },
    error: { fontSize: 12.5, color: c.destructive, paddingBottom: 8 },
  });
}
