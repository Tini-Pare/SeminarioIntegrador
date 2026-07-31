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

  const { data: callerProfile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .single();
  if (profileError || callerProfile?.role !== "admin") {
    return json({ error: "Forbidden — admin only" }, 403);
  }

  let body: { email?: string; name?: string; area?: string; password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const { email, name, area, password, role } = body;
  if (!email || !name || !password || !role) {
    return json({ error: "email, name, password and role are required" }, 400);
  }
  if (password.length < 6) {
    return json({ error: "password must be at least 6 characters" }, 400);
  }
  if (!["admin", "technician", "user"].includes(role)) {
    return json({ error: "role must be admin, technician or user" }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    return json({ error: createError?.message ?? "Could not create account" }, 500);
  }

  const { error: insertError } = await admin.from("profiles").insert({
    id: created.user.id,
    name,
    email,
    area: area?.trim() ? area.trim() : null,
    role,
    active: true,
  });
  if (insertError) {
    return json({ error: insertError.message }, 500);
  }

  return json({ ok: true }, 200);
});
