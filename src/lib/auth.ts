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

export async function signIn(
  legajo: string,
  password: string,
): Promise<{ error: string | null }> {
  // Required fields must be present before any auth work happens: a blank
  // legajo or password is a validation error, not an authentication attempt.
  if (!legajo.trim() || !password) {
    return { error: "Completá el legajo y la contraseña para ingresar." };
  }

  // Supabase Auth only ever authenticates by email, so the legajo is
  // resolved to its synthetic auth email first (see 0004_login_por_legajo.sql
  // and the invite-user Edge Function). A legajo with no matching user gets
  // the same generic message as a wrong password so the two can't be told
  // apart.
  const { data: email, error: lookupError } = await supabase.rpc("email_for_legajo", {
    p_legajo: legajo.trim(),
  });
  if (lookupError || !email) {
    return { error: "Legajo o contraseña incorrectos" };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
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
