import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

// Gap between a column's content and the next column. Header cells and row
// cells must both use tableCol() so this padding is identical in each.
const COL_GAP = 12;

// Style for one table column, shared by the header cell and every row cell of
// that column. flexBasis 0 + minWidth 0 make every column's width depend only
// on its flex value, never on its content, so a row with a long name or a
// wider badge can't push its columns out of line with the header.
export function tableCol(flex: number) {
  return {
    flexGrow: flex,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingRight: COL_GAP,
  } as const;
}

// Wraps a table (header + rows) so that, on screens narrower than `minWidth`,
// it scrolls sideways inside its card instead of squashing the columns into
// each other. On wider screens it fills the available width as before.
// Goes inside the bordered table card, so the border and rounded corners stay
// put while the content scrolls.
export function ScrollableTable({ minWidth, children }: { minWidth: number; children: ReactNode }) {
  const [viewportWidth, setViewportWidth] = useState(0);

  // A horizontal ScrollView lays its content out with an undefined width, and
  // on iOS/Android that makes flex columns size to their content row by row.
  // So the content gets an explicit width: the visible width, or minWidth when
  // the screen is narrower than that.
  const width = Math.max(minWidth, viewportWidth);

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
    >
      <View style={[styles.inner, { width }]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inner: { flexShrink: 0 },
});
