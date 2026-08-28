import { supabase } from "../supabase";
import type { Database, GenericFault } from "../../types/database";

type GenericFaultRow = Database["public"]["Tables"]["fallo"]["Row"];
const GENERIC_FAULT_COLUMNS = "fa_id_fallo, fa_nombre, fa_desperfecto, fa_activo";

export async function listGenericFaults(): Promise<GenericFault[]> {
  const { data, error } = await supabase
    .from("fallo")
    .select(GENERIC_FAULT_COLUMNS)
    .order("fa_nombre");
  if (error) throw new Error(error.message);
  return data as GenericFaultRow[];
}

export async function createGenericFault(input: {
  name: string;
  damage: string | null;
}): Promise<GenericFault> {
  const { data, error } = await supabase
    .from("fallo")
    .insert({
      fa_nombre: input.name.trim(),
      fa_desperfecto: input.damage?.trim() || null,
    })
    .select(GENERIC_FAULT_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as GenericFault;
}

export async function setGenericFaultActive(id: number, active: boolean): Promise<void> {
  const { error } = await supabase
    .from("fallo")
    .update({ fa_activo: active })
    .eq("fa_id_fallo", id);
  if (error) throw new Error(error.message);
}
