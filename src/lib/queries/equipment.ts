import { supabase } from "../supabase";
import type { Database, Equipo, HistorialEntry, Solicitud } from "../../types/database";
import { mapSolicitudRow, type SolicitudWithOrden } from "./faults";

type EquipoRow = Database["public"]["Tables"]["equipo"]["Row"] & {
  lugares: Database["public"]["Tables"]["lugares"]["Row"] | null;
  tipos_de_equipos: Database["public"]["Tables"]["tipos_de_equipos"]["Row"] | null;
};

function mapEquipo(row: EquipoRow): Equipo {
  return {
    id: row.eq_id_equipo,
    code: row.eq_codigo,
    name: row.eq_nombre,
    type: row.tipos_de_equipos?.te_nombre ?? "",
    typeId: row.te_id,
    location: row.lugares?.lu_nombre_sector ?? "",
    locationId: row.lu_codigo,
    status: row.eq_estado,
    purchaseDate: row.eq_fecha_instalacion,
  };
}

export async function listEquipment(): Promise<Equipo[]> {
  const { data, error } = await supabase
    .from("equipo")
    .select("*, lugares(*), tipos_de_equipos(*)")
    .order("lu_nombre_sector", { referencedTable: "lugares" })
    .order("eq_codigo");
  if (error) throw new Error(error.message);
  return (data as EquipoRow[]).map(mapEquipo);
}

// status isn't passed here on purpose: it's born 'operational' (the
// column's default) and from then on only sync_equipo_estado changes it
// based on active solicitudes/ordenes — allowing manual edits created a
// second writer that clashed with the automatic calculation (equipment
// showed "En reparación" with "Sin fallas activas" at the same time).
export async function createEquipment(input: {
  code: string;
  name: string;
  typeId: number;
  locationId: number;
  purchaseDate: string | null;
}): Promise<Equipo> {
  const { data, error } = await supabase
    .from("equipo")
    .insert({
      eq_codigo: input.code,
      eq_nombre: input.name,
      te_id: input.typeId,
      lu_codigo: input.locationId,
      eq_fecha_instalacion: input.purchaseDate,
    })
    .select("*, lugares(*), tipos_de_equipos(*)")
    .single();
  if (error) throw new Error(error.message);
  return mapEquipo(data as EquipoRow);
}

export async function updateEquipment(
  id: number,
  changes: {
    code: string;
    name: string;
    typeId: number;
    locationId: number;
    purchaseDate: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("equipo")
    .update({
      eq_codigo: changes.code,
      eq_nombre: changes.name,
      te_id: changes.typeId,
      lu_codigo: changes.locationId,
      eq_fecha_instalacion: changes.purchaseDate,
    })
    .eq("eq_id_equipo", id);
  if (error) throw new Error(error.message);
}

export async function deleteEquipment(id: number): Promise<void> {
  const { error } = await supabase.from("equipo").delete().eq("eq_id_equipo", id);
  if (error) throw new Error(error.message);
}

export async function getEquipmentById(id: number): Promise<Equipo | null> {
  const { data, error } = await supabase
    .from("equipo")
    .select("*, lugares(*), tipos_de_equipos(*)")
    .eq("eq_id_equipo", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return mapEquipo(data as EquipoRow);
}

// Active only — the equipment detail's "Fallas activas" tab is the only
// consumer, and a resolved solicitud shouldn't keep showing up there.
export async function listFaultsByEquipment(equipmentId: number): Promise<Solicitud[]> {
  const { data, error } = await supabase
    .from("solicitudes")
    .select("*, orden_de_trabajo(*)")
    .eq("eq_id_equipo", equipmentId)
    .order("sol_fecha_hora", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as SolicitudWithOrden[]).map(mapSolicitudRow).filter((s) => s.status !== "resolved");
}

export async function listHistoryByEquipment(equipmentId: number): Promise<HistorialEntry[]> {
  const { data, error } = await supabase
    .from("historial")
    .select("*")
    .eq("eq_id_equipo", equipmentId)
    .order("hi_fecha_hora", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Database["public"]["Tables"]["historial"]["Row"][]).map((row) => ({
    id: row.hi_id,
    equipment_id: row.eq_id_equipo,
    type: row.hi_tipo,
    note: row.hi_nota,
    author_id: row.hi_autor_id,
    created_at: row.hi_fecha_hora,
  }));
}
