import type { Profile } from "../types/database";
import { supabase } from "./supabase";

function formatAuthError(message: string): string {
  const normalized = message.toLowerCase().trim();
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("user not found")
  ) {
    return "El usuario se encuentra inhabilitado. Comuníquese con el administrador";
  }
  if (normalized.includes("email not confirmed")) {
    return "El correo electrónico no ha sido confirmado.";
  }
  if (normalized.includes("too many requests") || normalized.includes("rate limit")) {
    return "Demasiados intentos. Por favor, intentá de nuevo más tarde.";
  }
  return message;
}

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    return { error: formatAuthError(error.message) };
  }

  const profile = await getProfile();
  if (profile && !profile.active) {
    await supabase.auth.signOut();
    return { error: "El usuario se encuentra inhabilitado. Comuníquese con el administrador" };
  }

  return { error: null };
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
