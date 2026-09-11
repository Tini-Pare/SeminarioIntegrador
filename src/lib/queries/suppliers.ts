import { supabase } from "../supabase";
import type { Database, Proveedor, TipoProveedor } from "../../types/database";

type ProveedorRow = Database["public"]["Tables"]["proveedores"]["Row"] & {
  tipos_proveedores: { tp_nombre_rubro: string } | null;
};

export type SupplierWithRubro = Proveedor & { rubro: string | null };

const DUPLICATE_NAME_MESSAGE = "Ya existe un proveedor con ese nombre";

function isDuplicateNameError(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "23505" && !!error.message?.includes("proveedores_nombre_unico_idx");
}

function mapSupplier(row: ProveedorRow): SupplierWithRubro {
  return { ...row, rubro: row.tipos_proveedores?.tp_nombre_rubro ?? null };
}

export async function listSuppliers(): Promise<SupplierWithRubro[]> {
  const { data, error } = await supabase
    .from("proveedores")
    .select("*, tipos_proveedores(tp_nombre_rubro)")
    .order("prov_nombre");
  if (error) throw new Error(error.message);
  return (data as ProveedorRow[]).map(mapSupplier);
}

// Fixed catalog of supplier rubros. It's seeded by hand in the DB (see
// supabase/migrations, the tipos_proveedores comment) and the app never
// writes to it — the supplier form only picks from this list.
export async function listTiposProveedores(): Promise<TipoProveedor[]> {
  const { data, error } = await supabase
    .from("tipos_proveedores")
    .select("*")
    .order("tp_nombre_rubro");
  if (error) throw new Error(error.message);
  return data as TipoProveedor[];
}

export type SupplierInput = {
  name: string;
  phone: string | null;
  email: string | null;
  tpId: number | null;
};

// 23503 = Postgres foreign_key_violation on proveedores.tp_id — the chosen
// rubro id isn't in tipos_proveedores (stale client list).
function mapRubroFkError(error: { code?: string; message?: string } | null): Error | null {
  if (error?.code === "23503" && error.message?.includes("tp_id")) {
    return new Error("El rubro seleccionado ya no existe. Recargá la pantalla.");
  }
  return null;
}

export async function createSupplier(input: SupplierInput): Promise<void> {
  const { error } = await supabase.from("proveedores").insert({
    prov_nombre: input.name.trim(),
    prov_telefono: input.phone?.trim() || null,
    prov_correo: input.email?.trim() || null,
    tp_id: input.tpId,
  });
  if (error) {
    if (isDuplicateNameError(error)) throw new Error(DUPLICATE_NAME_MESSAGE);
    throw mapRubroFkError(error) ?? new Error(error.message);
  }
}

export async function updateSupplier(id: number, changes: SupplierInput): Promise<void> {
  const { error } = await supabase
    .from("proveedores")
    .update({
      prov_nombre: changes.name.trim(),
      prov_telefono: changes.phone?.trim() || null,
      prov_correo: changes.email?.trim() || null,
      tp_id: changes.tpId,
    })
    .eq("prov_id_proveedor", id);
  if (error) {
    if (isDuplicateNameError(error)) throw new Error(DUPLICATE_NAME_MESSAGE);
    throw mapRubroFkError(error) ?? new Error(error.message);
  }
}

// 23503 = Postgres foreign_key_violation — compras.prov_id_proveedor has no
// ON DELETE CASCADE (deleting a supplier shouldn't wipe purchase history).
export async function deleteSupplier(id: number): Promise<void> {
  const { error } = await supabase.from("proveedores").delete().eq("prov_id_proveedor", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error("No se puede eliminar: el proveedor tiene compras registradas.");
    }
    throw new Error(error.message);
  }
}
