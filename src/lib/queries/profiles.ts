import { supabase } from "../supabase";
import type { Profile } from "../../types/database";

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("name");
  if (error) throw new Error(error.message);
  return data as Profile[];
}

export async function updateProfile(
  id: string,
  changes: {
    role?: Profile["role"];
    active?: boolean;
    name?: string;
    area?: string;
    legajo?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("profiles").update(changes).eq("id", id);
  if (error) throw new Error(error.message);
}

// Deleting a user needs service-role access (auth.users row + profile), so
// it goes through the delete-user Edge Function rather than a table call.
export async function deleteUser(id: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sin sesión activa");

  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify({ id }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "No se pudo eliminar");
}
