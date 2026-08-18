import { supabase } from "../supabase";
import type { Equipment, Fault, HistoryEntry } from "../../types/database";

const EQUIPMENT_SELECT = "*, location:locations(name)";

// equipment.location_id is a FK to locations — the rest of the app still
// wants a plain location name string (see Equipment in types/database.ts),
// so every read here embeds the join and flattens it back to that shape.
function flattenLocation(row: Record<string, unknown>): Equipment {
  const { location, ...rest } = row;
  const name = (location as { name: string } | null)?.name ?? "";
  return { ...rest, location: name } as Equipment;
}

export async function listEquipment(): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from("equipment")
    .select(EQUIPMENT_SELECT)
    .order("name", { foreignTable: "locations" })
    .order("code");
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>[]).map(flattenLocation);
}

// status isn't passed here on purpose: it's born 'operational' (the
// column's default) and from then on only sync_equipment_status changes
// it based on active faults — allowing manual edits created a second
// writer that clashed with the automatic calculation (equipment showed
// "En reparación" with "Sin fallas activas" at the same time).
export async function createEquipment(input: {
  code: string;
  name: string;
  type: string;
  location_id: string;
}): Promise<Equipment> {
  const { data, error } = await supabase
    .from("equipment")
    .insert(input)
    .select(EQUIPMENT_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return flattenLocation(data as Record<string, unknown>);
}

export async function updateEquipment(
  id: string,
  changes: {
    code: string;
    name: string;
    type: string;
    location_id: string;
  },
): Promise<void> {
  const { error } = await supabase.from("equipment").update(changes).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteEquipment(id: string): Promise<void> {
  const { error } = await supabase.from("equipment").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getEquipmentById(id: string): Promise<Equipment | null> {
  const { data, error } = await supabase
    .from("equipment")
    .select(EQUIPMENT_SELECT)
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return flattenLocation(data as Record<string, unknown>);
}

// Active only — the equipment detail's "Fallas activas" tab is the only
// consumer, and a resolved fault shouldn't keep showing up there.
export async function listFaultsByEquipment(equipmentId: string): Promise<Fault[]> {
  const { data, error } = await supabase
    .from("faults")
    .select("*")
    .eq("equipment_id", equipmentId)
    .neq("status", "resolved")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Fault[];
}

export async function listHistoryByEquipment(equipmentId: string): Promise<HistoryEntry[]> {
  const { data, error } = await supabase
    .from("history")
    .select("*")
    .eq("equipment_id", equipmentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as HistoryEntry[];
}
