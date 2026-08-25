import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }
  const callerToken = authHeader.replace("Bearer ", "");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const {
    data: { user: caller },
    error: callerError,
  } = await admin.auth.getUser(callerToken);
  if (callerError || !caller) {
    return json({ error: "Invalid session" }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();
  if (callerProfileError || callerProfile?.role !== "admin") {
    return json({ error: "Forbidden — admin only" }, 403);
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { id } = body;
  if (!id) {
    return json({ error: "id is required" }, 400);
  }

  const { data: targetProfile, error: targetError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", id)
    .single();
  if (targetError || !targetProfile) {
    return json({ error: "Usuario no encontrado" }, 404);
  }
  if (targetProfile.role === "admin") {
    return json({ error: "No se puede eliminar un administrador desde la app" }, 403);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(id);
  if (deleteError) {
    const message =
      deleteError.message.includes("foreign key") || deleteError.message.includes("violates")
        ? "No se puede eliminar: tiene solicitudes, órdenes de trabajo o historial asociado. Desactivalo en su lugar."
        : deleteError.message;
    return json({ error: message }, 500);
  }

  return json({ ok: true }, 200);
});
