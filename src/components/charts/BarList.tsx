import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import type { ChartSeries } from "./palette";

export type BarRow = {
  key: string | number;
  label: string;
  sublabel?: string;
  // Value per series key; a single-series chart uses one key.
  values: Record<string, number>;
  // Right-hand text; defaults to the row's total.
  valueText?: string;
  // Shown under the row on hover/press; defaults to the series breakdown.
  detail?: string;
  // Overrides the series color for this row (single-series charts whose
  // bars encode something else, like a falla's gravedad).
  color?: string;
};

// Horizontal bars, one per row, optionally stacked by series. Each row's
// total is direct-labeled at its end; the per-series split shows on hover
// (web) or press (mobile), and a legend names the series whenever there's
// more than one.
export function BarList({
  rows,
  series,
  legend,
  selectedKey,
  onSelect,
  labelWidth = 150,
}: {
  rows: BarRow[];
  series: ChartSeries[];
  // Overrides the generated legend (e.g. a gravedad scale for colored rows).
  legend?: ChartSeries[];
  selectedKey?: string | number | null;
  onSelect?: (key: string | number) => void;
  labelWidth?: number;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [activeKey, setActiveKey] = useState<string | number | null>(null);

  const totalOf = (r: BarRow) => series.reduce((s, ser) => s + (r.values[ser.key] ?? 0), 0);
  const max = Math.max(1, ...rows.map(totalOf));
  const legendItems = legend ?? (series.length > 1 ? series : []);

  return (
    <View>
      {legendItems.length > 0 && <Legend items={legendItems} />}

      <View style={styles.rows}>
        {rows.map((r) => {
          const total = totalOf(r);
          const visible = series.filter((s) => (r.values[s.key] ?? 0) > 0);
          const isActive = activeKey === r.key;
          const isSelected = selectedKey != null && selectedKey === r.key;
          const detail =
            r.detail ??
            (series.length > 1
              ? series.map((s) => `${s.label} ${r.values[s.key] ?? 0}`).join(" · ")
              : undefined);

          return (
            <Pressable
              key={r.key}
              style={[styles.row, isSelected && styles.rowSelected]}
              onHoverIn={() => setActiveKey(r.key)}
              onHoverOut={() => setActiveKey((k) => (k === r.key ? null : k))}
              onPress={() => {
                // On web hover already shows the detail; toggling it here
                // would hide it under the cursor on click.
                if (Platform.OS !== "web") setActiveKey((k) => (k === r.key ? null : r.key));
                onSelect?.(r.key);
              }}
              accessibilityRole={onSelect ? "button" : undefined}
              accessibilityLabel={`${r.label}: ${r.valueText ?? total}${detail ? `. ${detail}` : ""}`}
            >
              <View style={styles.rowMain}>
                <View style={{ width: labelWidth, flexShrink: 1, minWidth: 0 }}>
                  <Text style={styles.label} numberOfLines={1}>
                    {r.label}
                  </Text>

                  {r.sublabel && (
                    <Text style={styles.sublabel} numberOfLines={1}>
                      {r.sublabel}
                    </Text>
                  )}
                </View>

                <View style={styles.track}>
                  {visible.map((s, i) => (
                    <View
                      key={s.key}
                      style={[
                        styles.segment,
                        {
                          backgroundColor: r.color ?? s.color,
                          width: `${((r.values[s.key] ?? 0) / max) * 100}%`,
                          marginRight: i < visible.length - 1 ? 2 : 0,
                        },
                        i === visible.length - 1 && styles.segmentEnd,
                      ]}
                    />
                  ))}
                </View>

                <Text style={styles.value}>{r.valueText ?? total}</Text>
              </View>

              {isActive && detail && <Text style={styles.detail}>{detail}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Legend({ items }: { items: ChartSeries[] }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.legend}>
      {items.map((s) => (
        <View key={s.key} style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />

          <Text style={styles.legendText}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    rows: { gap: 4 },
    row: { paddingVertical: 6, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 8 },
    rowSelected: { backgroundColor: c.bgNested },
    rowMain: { flexDirection: "row", alignItems: "center", gap: 12 },
    label: { fontSize: 13, color: c.textLabel, fontWeight: "500" },
    sublabel: { fontSize: 11.5, color: c.textMuted, marginTop: 1, fontFamily: "monospace" },
    track: {
      flex: 1,
      height: 18,
      flexDirection: "row",
      borderRadius: 4,
      backgroundColor: c.bgNested,
      overflow: "hidden",
    },
    segment: { height: "100%" },
    segmentEnd: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
    value: {
      minWidth: 36,
      textAlign: "right",
      fontSize: 13.5,
      fontWeight: "700",
      color: c.text,
      fontVariant: ["tabular-nums"],
    },
    detail: { marginTop: 4, fontSize: 12, color: c.textSecondary },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 12 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendSwatch: { width: 10, height: 10, borderRadius: 3 },
    legendText: { fontSize: 12.5, color: c.textSecondary },
  });
}
