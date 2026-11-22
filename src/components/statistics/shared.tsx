import { createContext, useContext, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StatisticsData } from "../../lib/queries/statistics";
import type { OrderTypeFilter, StatsPeriod } from "../../lib/statistics";
import type { Equipo, Profile, WorkOrder } from "../../types/database";

// What every Estadísticas tab gets from the screen.
export type StatsTabProps = {
  data: StatisticsData;
  period: StatsPeriod;
  type: OrderTypeFilter;
  today: string;
  equipmentById: Map<number, Equipo>;
  profileById: Map<string, Profile>;
  isWide: boolean;
};

export const ORDER_TYPE_LABELS: Record<string, string> = {
  correctivo: "Correctivo",
  preventivo: "Preventivo",
};

export const PRIORITY_LABELS: Record<WorkOrder["priority"], string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export const ORDER_STATUS_LABELS: Record<WorkOrder["status"], string> = {
  assigned: "Asignada",
  in_progress: "En curso",
  resolved: "Resuelta",
};

export function personName(profileById: Map<string, Profile>, id: string): string {
  return profileById.get(id)?.name ?? "Técnico desconocido";
}

// Two blocks side by side on a wide screen, stacked on a phone.
export function TwoColumns({ isWide, children }: { isWide: boolean; children: ReactNode }) {
  return (
    <ColumnsWideContext.Provider value={isWide}>
      <View style={isWide ? styles.columns : styles.stack}>{children}</View>
    </ColumnsWideContext.Provider>
  );
}

// Whether the enclosing TwoColumns lays its columns side by side.
const ColumnsWideContext = createContext(false);

export function Column({ children }: { children: ReactNode }) {
  // flex: 1 only splits the width of a row. In a vertical stack inside a
  // ScrollView it means flexBasis 0, so the column ends up shorter than its
  // panels and the next column draws on top of them.
  const isWide = useContext(ColumnsWideContext);
  return <View style={isWide ? styles.column : styles.stack}>{children}</View>;
}

export function TabStack({ children }: { children: ReactNode }) {
  return <View style={styles.stack}>{children}</View>;
}

export function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  columns: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  column: { flex: 1, minWidth: 0, gap: 16 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 2.5, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: "600" },
});
