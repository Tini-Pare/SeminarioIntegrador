import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { useIsPhone } from "../../lib/useIsPhone";
import { Legend } from "./BarList";
import type { ChartSeries } from "./palette";

export type ColumnBucket = {
  key: string;
  label: string;
  // Longer name for the readout, e.g. "Semana del 03/11".
  detailLabel?: string;
  values: Record<string, number>;
};

const MAX_X_LABELS = 8;
const MAX_X_LABELS_PHONE = 4;

// Stacked columns over time (one per week/month). The readout line above
// the plot shows the hovered/pressed column's numbers, or the period's
// totals when none is — so values are always available as text without
// labeling every column.
export function ColumnChart({
  buckets,
  series,
  height = 150,
}: {
  buckets: ColumnBucket[];
  series: ChartSeries[];
  height?: number;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const totalOf = (b: ColumnBucket) => series.reduce((s, ser) => s + (b.values[ser.key] ?? 0), 0);
  const max = Math.max(1, ...buckets.map(totalOf));
  const isPhone = useIsPhone();
  const labelEvery = Math.ceil(buckets.length / (isPhone ? MAX_X_LABELS_PHONE : MAX_X_LABELS));
  const labelGroups = buckets
    .filter((_, i) => i % labelEvery === 0)
    .map((bucket, g) => ({
      bucket,
      span: Math.min(labelEvery, buckets.length - g * labelEvery),
    }));
  const active = buckets.find((b) => b.key === activeKey) ?? null;
  // Same gap under the plot and its x labels, so each label sits under its column.
  const gap = buckets.length > 20 ? 2 : 6;

  const readoutValues = series.map((s) => {
    const n = active
      ? (active.values[s.key] ?? 0)
      : buckets.reduce((sum, b) => sum + (b.values[s.key] ?? 0), 0);
    return `${s.label} ${n}`;
  });

  return (
    <View>
      {series.length > 1 && <Legend items={series} />}

      <Text style={styles.readout}>
        <Text style={styles.readoutLabel}>
          {active ? (active.detailLabel ?? active.label) : "Total del período"}:{" "}
        </Text>

        {readoutValues.join(" · ")}
      </Text>

      <View style={styles.plotRow}>
        <View style={[styles.axis, { height }]}>
          <Text style={styles.axisText}>{max}</Text>

          <Text style={styles.axisText}>0</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={[styles.plot, { height, gap }]}>
            {buckets.map((b) => {
              const visible = series.filter((s) => (b.values[s.key] ?? 0) > 0);
              return (
                <Pressable
                  key={b.key}
                  style={[styles.column, activeKey === b.key && styles.columnActive]}
                  onHoverIn={() => setActiveKey(b.key)}
                  onHoverOut={() => setActiveKey((k) => (k === b.key ? null : k))}
                  onPress={() => {
                    // Hover drives it on web (see BarList).
                    if (Platform.OS !== "web") setActiveKey((k) => (k === b.key ? null : b.key));
                  }}
                  accessibilityLabel={`${b.detailLabel ?? b.label}: ${series
                    .map((s) => `${s.label} ${b.values[s.key] ?? 0}`)
                    .join(", ")}`}
                >
                  {visible.map((s, i) => (
                    <View
                      key={s.key}
                      style={[
                        styles.segment,
                        {
                          backgroundColor: s.color,
                          height: ((b.values[s.key] ?? 0) / max) * height,
                          marginTop: i > 0 ? 2 : 0,
                        },
                        i === 0 && styles.segmentTop,
                      ]}
                    />
                  ))}
                </Pressable>
              );
            })}
          </View>

          {isPhone ? (
            // A phone column is ~16px wide, too narrow for "ene 26": each
            // label spans its whole group of columns, starting under the
            // first one.
            <View style={[styles.xLabels, { gap }]}>
              {labelGroups.map(({ bucket, span }) => (
                <Text
                  key={bucket.key}
                  style={[styles.xLabel, { flex: span, textAlign: "left" }]}
                  numberOfLines={1}
                >
                  {bucket.label}
                </Text>
              ))}
            </View>
          ) : (
            <View style={[styles.xLabels, { gap }]}>
              {buckets.map((b, i) => (
                <Text key={b.key} style={styles.xLabel} numberOfLines={1}>
                  {i % labelEvery === 0 ? b.label : ""}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    readout: { fontSize: 13, color: c.text, marginBottom: 12, fontVariant: ["tabular-nums"] },
    readoutLabel: { color: c.textSecondary },
    plotRow: { flexDirection: "row", gap: 8 },
    axis: { justifyContent: "space-between", alignItems: "flex-end", minWidth: 18 },
    axisText: { fontSize: 11, color: c.textMuted, fontVariant: ["tabular-nums"] },
    plot: {
      flexDirection: "row",
      alignItems: "flex-end",
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
      borderTopWidth: 1,
      borderTopColor: c.bgNested,
    },
    // Taller than its bars, so the whole column is the hit target.
    column: { flex: 1, height: "100%", justifyContent: "flex-end", borderRadius: 4 },
    columnActive: { backgroundColor: c.bgNested },
    segment: { width: "100%" },
    // Segments render top-down; the first one is the column's top end.
    segmentTop: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    xLabels: { flexDirection: "row", marginTop: 6 },
    xLabel: { flex: 1, fontSize: 11, color: c.textMuted, textAlign: "center" },
  });
}
