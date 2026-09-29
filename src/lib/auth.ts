import type { Profile } from "../types/database";
import { supabase } from "./supabase";

function formatAuthError(message: string): string {
  const normalized = message.toLowerCase().trim();
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("user not found")
  ) {
    // Same generic message as an unknown legajo below — a wrong password and
    // a disabled account are different problems (see the profile.active
    // check further down, which owns "usuario inhabilitado"), and Supabase
    // returns this exact same error for both a bad password and an unknown
    // email, so it can't be told apart here either.
    return "Legajo o contraseña incorrectos";
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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: formatAuthError(error.message) };
  }

  // Looked up by the user id signInWithPassword just returned, not via
  // getProfile()/getSession() — _layout.tsx's onAuthStateChange listener
  // reacts to this same sign-in and may sign the session back out (its own
  // profile.active check) concurrently with this function's. Reading the
  // session here would race it: if that signOut lands first, getSession()
  // comes back empty and this check gets silently skipped, letting a
  // disabled account in with no error at all.
  const userId = data.user?.id;
  if (!userId) {
    return { error: "No se pudo iniciar sesión. Intentá nuevamente." };
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  const profile = profileRow as Profile | null;
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
