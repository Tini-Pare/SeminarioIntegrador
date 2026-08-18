import { supabase } from "../supabase";
import type { Location } from "../../types/database";

export async function listLocations(): Promise<Location[]> {
  const { data, error } = await supabase.from("locations").select("*").order("name");
  if (error) throw new Error(error.message);
  return data as Location[];
}

export async function listLocationsWithCounts(): Promise<
  (Location & { equipmentCount: number })[]
> {
  const { data, error } = await supabase
    .from("locations")
    .select("*, equipment(count)")
    .order("name");
  if (error) throw new Error(error.message);
  return (data as unknown as (Location & { equipment: { count: number }[] })[]).map((row) => ({
    ...row,
    equipmentCount: row.equipment[0]?.count ?? 0,
  }));
}

export async function createLocation(name: string): Promise<Location> {
  const { data, error } = await supabase.from("locations").insert({ name }).select().single();
  if (error) throw new Error(error.message);
  return data as Location;
}

export async function updateLocation(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("locations").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
