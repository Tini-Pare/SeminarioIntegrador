import { Pressable, View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import type { Equipment } from "../types/database";
import { StatusBadge } from "./StatusBadge";
import { LocationIcon } from "./icons";

export function EquipmentCard({
  equipment,
  locationColor,
}: {
  equipment: Equipment;
  locationColor: string;
}) {
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/equipment/${equipment.id}`)}>
      <View style={styles.row}>
        <Text style={styles.code}>{equipment.code}</Text>
        <StatusBadge status={equipment.status} />
      </View>

      <Text style={styles.name}>{equipment.name}</Text>
      <Text style={styles.meta}>{equipment.type}</Text>

      <View style={styles.locationRow}>
        <View style={[styles.locationDot, { backgroundColor: locationColor }]} />
        <LocationIcon size={14} />
        <Text style={styles.locationText}>{equipment.location}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#f8f6f1",
    borderWidth: 1,
    borderColor: "#e2ddd3",
    borderRadius: 14,
    padding: 18,
  },
  locationDot: { width: 7, height: 7, borderRadius: 4 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  code: { fontFamily: "monospace", fontSize: 12.5, color: "#8a8d95" },
  name: { fontSize: 18, fontWeight: "600", color: "#17191f" },
  meta: { fontSize: 12.5, color: "#8a8d95", marginTop: 2 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 13 },
  locationText: { fontSize: 13, color: "#5b5e66" },
});
