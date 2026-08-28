import { useWindowDimensions, View, Text, Image, ScrollView, StyleSheet } from "react-native";
import type { Solicitud, Equipo } from "../types/database";
import { BREAKPOINT } from "../constants";
import { WarningIcon } from "./icons";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

type Item = Solicitud & {
  equipment: Pick<Equipo, "code" | "name">;
  reporterName: string;
  technicianName: string | null;
};

const STATUS_LABELS: Record<Solicitud["status"], string> = {
  new: "Nueva",
  assigned: "Asignada",
  in_progress: "En curso",
  resolved: "Resuelta",
};

const URGENCY_LABELS: Record<Solicitud["urgency"], string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export function RequestList({ items }: { items: Item[] }) {
  const { width } = useWindowDimensions();
  const isWide = width >= BREAKPOINT.mobile;
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No hay solicitudes todavía. Reportá una falla desde la lista de equipos.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {isWide ? (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.requestColumn]}>SOLICITUD</Text>
              <Text style={[styles.headerCell, styles.equipmentColumn]}>EQUIPO</Text>
              <Text style={[styles.headerCell, styles.statusColumn]}>ESTADO</Text>
              <Text style={[styles.headerCell, styles.urgencyColumn]}>URGENCIA</Text>
              <Text style={[styles.headerCell, styles.personColumn]}>REPORTÓ</Text>
              <Text style={[styles.headerCell, styles.personColumn]}>TÉCNICO</Text>
              <Text style={[styles.headerCell, styles.dateColumn]}>FECHA</Text>
            </View>

            {items.map((item) => (
              <RequestTableRow key={item.id} item={item} colors={colors} styles={styles} />
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.cardList}>
          {items.map((item) => (
            <RequestCard key={item.id} item={item} colors={colors} styles={styles} />
          ))}
        </View>
      )}
    </View>
  );
}

function RequestTableRow({
  item,
  colors,
  styles,
}: {
  item: Item;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const status = getStatusColors(item.status, colors);
  const urgency = getUrgencyColors(item.urgency, colors);

  return (
    <View style={styles.tableRow}>
      <View style={[styles.cell, styles.requestColumn, styles.requestCell]}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.tablePhoto} />
        ) : (
          <View style={[styles.tableIconWrap, { backgroundColor: urgency.bg }]}>
            <WarningIcon size={17} color={urgency.fg} />
          </View>
        )}

        <Text style={styles.requestText} numberOfLines={2}>
          {item.description}
        </Text>
      </View>

      <View style={[styles.cell, styles.equipmentColumn]}>
        <Text style={styles.equipmentName} numberOfLines={1}>
          {item.equipment.name}
        </Text>
        <Text style={styles.equipmentCode} numberOfLines={1}>
          {item.equipment.code}
        </Text>
      </View>

      <View style={[styles.cell, styles.statusColumn]}>
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={[styles.badgeText, { color: status.fg }]}>{status.label}</Text>
        </View>
      </View>

      <View style={[styles.cell, styles.urgencyColumn]}>
        <View style={[styles.badge, { backgroundColor: urgency.bg }]}>
          <Text style={[styles.badgeText, { color: urgency.fg }]}>{urgency.label}</Text>
        </View>
      </View>

      <Text style={[styles.cellText, styles.personColumn]} numberOfLines={1}>
        {item.reporterName}
      </Text>

      <Text style={[styles.cellText, styles.personColumn]} numberOfLines={1}>
        {item.technicianName ?? "Sin asignar"}
      </Text>

      <Text style={[styles.cellText, styles.dateColumn]} numberOfLines={1}>
        {new Date(item.created_at).toLocaleDateString("es-AR")}
      </Text>
    </View>
  );
}

function RequestCard({
  item,
  colors,
  styles,
}: {
  item: Item;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const status = getStatusColors(item.status, colors);
  const urgency = getUrgencyColors(item.urgency, colors);

  return (
    <View style={styles.card}>
      {item.photo_url ? (
        <Image source={{ uri: item.photo_url }} style={styles.photo} />
      ) : (
        <View style={[styles.iconWrap, { backgroundColor: urgency.bg }]}>
          <WarningIcon size={20} color={urgency.fg} />
        </View>
      )}

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={styles.cardEquipment}>
            <Text style={styles.equipmentName} numberOfLines={1}>
              {item.equipment.name}
            </Text>
            <Text style={styles.equipmentCode} numberOfLines={1}>
              {item.equipment.code}
            </Text>
          </View>

          <View style={styles.badgesRow}>
            <View style={[styles.badge, { backgroundColor: status.bg }]}>
              <Text style={[styles.badgeText, { color: status.fg }]}>{status.label}</Text>
            </View>

            <View style={[styles.badge, { backgroundColor: urgency.bg }]}>
              <Text style={[styles.badgeText, { color: urgency.fg }]}>{urgency.label}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.desc}>{item.description}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.meta}>Reportó · {item.reporterName}</Text>
          <Text style={styles.meta}>Técnico · {item.technicianName ?? "Sin asignar"}</Text>
          <Text style={styles.meta}>{new Date(item.created_at).toLocaleDateString("es-AR")}</Text>
        </View>
      </View>
    </View>
  );
}

function getStatusColors(status: Solicitud["status"], colors: ThemeColors) {
  const palette =
    status === "new"
      ? colors.faultNew
      : status === "assigned"
        ? colors.faultAssigned
        : status === "in_progress"
          ? colors.faultInProgress
          : colors.faultResolved;
  return { ...palette, label: STATUS_LABELS[status] };
}

function getUrgencyColors(urgency: Solicitud["urgency"], colors: ThemeColors) {
  const palette =
    urgency === "low"
      ? colors.urgencyLow
      : urgency === "medium"
        ? colors.urgencyMedium
        : colors.urgencyHigh;
  return { ...palette, label: URGENCY_LABELS[urgency] };
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    list: { gap: 12 },
    empty: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: c.borderInput,
      borderRadius: 14,
      padding: 40,
      alignItems: "center",
    },
    emptyText: { color: c.textMuted, fontSize: 14, textAlign: "center" },
    table: {
      minWidth: 1200,
      width: "100%",
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 46,
      paddingHorizontal: 14,
      backgroundColor: c.bgTableHeader,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 76,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    headerCell: {
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: c.textMuted,
      fontFamily: "monospace",
    },
    cell: { justifyContent: "center", paddingVertical: 10 },
    requestColumn: { width: 300 },
    equipmentColumn: { width: 185, paddingHorizontal: 8 },
    statusColumn: { width: 130, paddingHorizontal: 8 },
    urgencyColumn: { width: 130, paddingHorizontal: 8 },
    personColumn: { width: 170, paddingHorizontal: 8 },
    dateColumn: { width: 115, paddingHorizontal: 8 },
    requestCell: { flexDirection: "row", alignItems: "center", gap: 10 },
    tablePhoto: { width: 36, height: 36, borderRadius: 9, backgroundColor: c.bgNested },
    tableIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    requestText: { flex: 1, color: c.textLabel, fontSize: 13, lineHeight: 18 },
    cellText: { color: c.textLabel, fontSize: 13 },
    equipmentName: { fontWeight: "600", fontSize: 14, color: c.text },
    equipmentCode: { fontFamily: "monospace", fontSize: 12, color: c.textMuted, marginTop: 3 },
    badge: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
    badgeText: { fontSize: 11.5, fontWeight: "600" },
    cardList: { gap: 12 },
    card: {
      flexDirection: "row",
      gap: 16,
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 18,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    photo: { width: 42, height: 42, borderRadius: 10, backgroundColor: c.bgNested },
    cardContent: { flex: 1, minWidth: 0 },
    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
    },
    cardEquipment: { flex: 1, minWidth: 0 },
    badgesRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
    desc: { marginTop: 8, fontSize: 13.5, color: c.textLabel, lineHeight: 19 },
    metaRow: { marginTop: 9, flexDirection: "row", gap: 16, flexWrap: "wrap" },
    meta: { fontSize: 12.5, color: c.textMuted },
  });
}
