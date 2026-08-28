import { supabase } from "../supabase";
import type { Database, Equipo, HistorialEntry, Solicitud, TipoEquipo } from "../../types/database";
import { mapSolicitudRow, type SolicitudWithOrden } from "./faults";

type EquipoRow = Database["public"]["Tables"]["equipo"]["Row"] & {
  lugares: Database["public"]["Tables"]["lugares"]["Row"] | null;
  tipos_de_equipos: Database["public"]["Tables"]["tipos_de_equipos"]["Row"] | null;
};

const DEFAULT_EQUIPMENT_TYPES = [
  "Aire acondicionado",
  "Bomba",
  "Caldera",
  "Climatizacion",
  "Compresor",
  "Equipo de medicion",
  "Extractor",
  "Generador electrico",
  "Horno industrial",
  "Maquina herramienta",
  "Motor",
  "Panel electrico",
  "Refrigeracion",
  "Soldadora",
  "Torno",
  "Transportador",
  "Valvula",
  "Ventilador industrial",
];

function mapEquipo(row: EquipoRow): Equipo {
  return {
    id: row.eq_id_equipo,
    code: row.eq_codigo,
    name: row.eq_nombre,
    typeId: row.te_id,
    locationId: row.lu_codigo,
    active: row.eq_activo ?? true,
    type: row.tipos_de_equipos?.te_nombre ?? "",
    location: row.lugares?.lu_nombre_sector ?? "",
    status: row.eq_estado,
    model: row.eq_modelo,
    warrantyDate: row.eq_fecha_garantia,
    installationDate: row.eq_fecha_instalacion,
    purchaseDate: row.eq_fecha_compra,
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

export async function listEquipmentTypes(): Promise<TipoEquipo[]> {
  const { data, error } = await supabase.from("tipos_de_equipos").select("*").order("te_nombre");
  if (error) throw new Error(error.message);
  return data as TipoEquipo[];
}

export async function ensureEquipmentTypes(): Promise<void> {
  const { data, error } = await supabase.from("tipos_de_equipos").select("te_nombre");
  if (error) throw new Error(error.message);

  const existing = new Set(
    (data as { te_nombre: string }[]).map((type) => type.te_nombre.trim().toLowerCase()),
  );
  const missing = DEFAULT_EQUIPMENT_TYPES.filter((type) => !existing.has(type.toLowerCase()));
  if (missing.length === 0) return;

  const { error: insertError } = await supabase
    .from("tipos_de_equipos")
    .insert(missing.map((te_nombre) => ({ te_nombre })));
  if (insertError) throw new Error(insertError.message);
}

// status isn't passed here on purpose: it's born 'operational' (the
// column's default) and from then on only sync_equipo_estado changes it
// based on unresolved solicitudes/ordenes — allowing manual edits created a
// second writer that clashed with the automatic calculation.
export async function createEquipment(input: {
  code: string;
  name: string;
  typeId: number;
  locationId: number;
  model: string | null;
  warrantyDate: string | null;
  installationDate: string | null;
  purchaseDate: string | null;
}): Promise<Equipo> {
  const { data, error } = await supabase
    .from("equipo")
    .insert({
      eq_codigo: input.code,
      eq_nombre: input.name,
      te_id: input.typeId,
      lu_codigo: input.locationId,
      eq_modelo: input.model,
      eq_fecha_garantia: input.warrantyDate,
      eq_fecha_instalacion: input.installationDate,
      eq_fecha_compra: input.purchaseDate,
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
    model: string | null;
    warrantyDate: string | null;
    installationDate: string | null;
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
      eq_modelo: changes.model,
      eq_fecha_garantia: changes.warrantyDate,
      eq_fecha_instalacion: changes.installationDate,
      eq_fecha_compra: changes.purchaseDate,
    })
    .eq("eq_id_equipo", id);
  if (error) throw new Error(error.message);
}

export async function setEquipmentActive(id: number, active: boolean): Promise<void> {
  const { error } = await supabase
    .from("equipo")
    .update({ eq_activo: active })
    .eq("eq_id_equipo", id);
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
