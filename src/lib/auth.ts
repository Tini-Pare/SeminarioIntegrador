import type { Profile } from "../types/database";
import { supabase } from "./supabase";

export async function signIn(
  legajo: string,
  password: string,
): Promise<{ error: string | null }> {
  // Supabase Auth only ever authenticates by email, so the legajo is
  // resolved to its synthetic auth email first (see 0004_login_por_legajo.sql
  // and the invite-user Edge Function). Both failure paths share one
  // message so a wrong legajo can't be told apart from a wrong password.
  const { data: email, error: lookupError } = await supabase.rpc("email_for_legajo", {
    p_legajo: legajo.trim(),
  });
  if (lookupError || !email) {
    return { error: "Legajo o contraseña incorrectos" };
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error ? "Legajo o contraseña incorrectos" : null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function changePassword(newPassword: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: error ? error.message : null };
}

export async function getProfile(): Promise<Profile | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();
  if (error) return null;
  return data as Profile;
}
