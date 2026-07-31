import { supabase } from "../supabase";
import type { Equipment, Fault, HistoryEntry } from "../../types/database";

export async function listEquipment(): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from("equipment")
    .select("*")
    .order("location")
    .order("code");
  if (error) throw new Error(error.message);
  return data as Equipment[];
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
  location: string;
}): Promise<Equipment> {
  const { data, error } = await supabase.from("equipment").insert(input).select().single();
  if (error) throw new Error(error.message);
  return data as Equipment;
}

export async function updateEquipment(
  id: string,
  changes: {
    code: string;
    name: string;
    type: string;
    location: string;
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
  const { data, error } = await supabase.from("equipment").select("*").eq("id", id).single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return data as Equipment;
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
