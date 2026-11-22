import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ThemeColors } from "../../lib/theme";
import { useTheme } from "../../lib/ThemeContext";
import { usePagination } from "../../lib/usePagination";
import { Pagination } from "../Pagination";
import { ScrollableTable, tableCol } from "../ScrollableTable";

export type StatColumn<T> = {
  key: string;
  label: string;
  flex: number;
  // Figures are right-aligned so their digits line up.
  align?: "left" | "right";
  render: (row: T) => ReactNode;
};

// Read-only table for the Estadísticas tabs, same look as the list screens
// (green header, zebra rows). Rows come pre-sorted by what matters for that
// table; it paginates client-side and scrolls sideways on a narrow screen
// instead of squeezing its columns.
export function StatTable<T>({
  columns,
  rows,
  rowKey,
  onRowPress,
  selectedKey,
  minWidth = 560,
  pageSize = 8,
  resetKey = "",
}: {
  columns: StatColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowPress?: (row: T) => void;
  selectedKey?: string | number | null;
  minWidth?: number;
  pageSize?: number;
  resetKey?: string;
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const page = usePagination(rows, resetKey, pageSize);

  return (
    <View>
      {/* The border stays on the outer card so it doesn't scroll away with
          the content; ScrollableTable gives the columns an explicit width,
          which keeps them lined up on iOS/Android. */}
      <View style={styles.table}>
        <ScrollableTable minWidth={minWidth}>
          <View style={styles.header}>
            {columns.map((col) => (
              <Text
                key={col.key}
                style={[
                  styles.headerCell,
                  tableCol(col.flex),
                  col.align === "right" && styles.right,
                ]}
                numberOfLines={1}
              >
                {col.label}
              </Text>
            ))}
          </View>

          {page.pageItems.map((row, i) => {
            const key = rowKey(row);
            const cells = columns.map((col) => {
              const content = col.render(row);
              return (
                <View
                  key={col.key}
                  style={[
                    styles.cell,
                    tableCol(col.flex),
                    col.align === "right" && styles.cellRight,
                  ]}
                >
                  {typeof content === "string" || typeof content === "number" ? (
                    <Text
                      style={[styles.cellText, col.align === "right" && styles.right]}
                      numberOfLines={1}
                    >
                      {content}
                    </Text>
                  ) : (
                    content
                  )}
                </View>
              );
            });
            const rowStyle = [
              styles.row,
              i % 2 === 1 && styles.rowAlt,
              selectedKey != null && selectedKey === key && styles.rowSelected,
            ];
            return onRowPress ? (
              <Pressable key={key} style={rowStyle} onPress={() => onRowPress(row)}>
                {cells}
              </Pressable>
            ) : (
              <View key={key} style={rowStyle}>
                {cells}
              </View>
            );
          })}
        </ScrollableTable>
      </View>

      <Pagination page={page.page} pageCount={page.pageCount} onPage={page.setPage} />
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    table: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: c.accent,
    },
    headerCell: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#fff",
      fontFamily: "monospace",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      backgroundColor: c.bgRow,
    },
    rowAlt: { backgroundColor: c.bgRowAlt },
    rowSelected: { backgroundColor: c.bgRowHover },
    cell: { justifyContent: "center" },
    cellRight: { alignItems: "flex-end" },
    cellText: { fontSize: 13.5, color: c.textLabel, fontVariant: ["tabular-nums"] },
    right: { textAlign: "right" },
  });
}
