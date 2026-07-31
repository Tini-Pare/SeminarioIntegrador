import { supabase } from "../supabase";
import type { Profile } from "../../types/database";

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("name");
  if (error) throw new Error(error.message);
  return data as Profile[];
}

export async function updateProfile(
  id: string,
  changes: { role?: Profile["role"]; active?: boolean; name?: string; area?: string },
): Promise<void> {
  const { error } = await supabase.from("profiles").update(changes).eq("id", id);
  if (error) throw new Error(error.message);
}
