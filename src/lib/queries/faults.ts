import { supabase } from "../supabase";
import type { Fault } from "../../types/database";

async function currentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("no session");
  return session.user.id;
}

async function syncEquipmentStatus(equipmentId: string): Promise<void> {
  const { error } = await supabase.rpc("sync_equipment_status", { p_equipment_id: equipmentId });
  if (error) throw new Error(error.message);
}

async function logHistory(equipmentId: string, type: string, note: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from("history")
    .insert({ equipment_id: equipmentId, type, note, author_id: userId });
  if (error) throw new Error(error.message);
}

export async function createFault(input: {
  equipmentId: string;
  description: string;
  urgency: Fault["urgency"];
  photoUrl?: string;
}): Promise<Fault> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("faults")
    .insert({
      equipment_id: input.equipmentId,
      description: input.description,
      urgency: input.urgency,
      reported_by: userId,
      status: "new",
      photo_url: input.photoUrl ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await syncEquipmentStatus(input.equipmentId);
  await logHistory(input.equipmentId, "Reporte", input.description);
  return data as Fault;
}

export async function listMyRequests(): Promise<Fault[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("faults")
    .select("*")
    .eq("reported_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Fault[];
}

export async function listAllRequests(): Promise<Fault[]> {
  const { data, error } = await supabase
    .from("faults")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Fault[];
}

export async function listWorkQueue(): Promise<Fault[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("faults")
    .select("*")
    .or(`technician_id.eq.${userId},status.eq.new`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Fault[];
}

export async function assignToMe(faultId: string): Promise<void> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("faults")
    .update({ technician_id: userId, status: "assigned" })
    .eq("id", faultId)
    .select("equipment_id, description")
    .single();
  if (error) throw new Error(error.message);
  await syncEquipmentStatus(data.equipment_id);
  await logHistory(data.equipment_id, "Asignada", `Falla asignada: ${data.description}`);
}

export async function advanceStatus(faultId: string, nextStatus: Fault["status"]): Promise<void> {
  const { data, error } = await supabase
    .from("faults")
    .update({ status: nextStatus })
    .eq("id", faultId)
    .select("equipment_id, description")
    .single();
  if (error) throw new Error(error.message);
  await syncEquipmentStatus(data.equipment_id);
  if (nextStatus === "in_progress") {
    await logHistory(data.equipment_id, "En curso", `Reparación iniciada: ${data.description}`);
  }
  if (nextStatus === "resolved") {
    await logHistory(data.equipment_id, "Resuelta", `Falla resuelta: ${data.description}`);
  }
}
