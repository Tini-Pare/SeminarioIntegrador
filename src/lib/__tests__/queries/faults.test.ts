jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
    rpc: jest.fn(),
  },
}));

import {
  advanceStatus,
  assignToMe,
  createFault,
  listAllRequests,
  listMyRequests,
  listWorkQueue,
} from "../../queries/faults";
import { supabase } from "../../supabase";

beforeEach(() => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ error: null });
});

describe("createFault", () => {
  it("inserts a solicitud with reported_by from the current session, then syncs equipo status and logs historial", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
    const single = jest.fn().mockResolvedValue({
      data: {
        sol_id_solicitud: 1,
        eq_id_equipo: 5,
        p_legajo_solicitante: "u1",
        sol_descripcion: "no enfría",
        sol_foto_url: null,
        sol_fecha_hora: "2026-01-01T00:00:00Z",
        orden_de_trabajo: [],
      },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insertSolicitud = jest.fn().mockReturnValue({ select });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "historial" ? { insert: insertHistorial } : { insert: insertSolicitud },
    );

    const result = await createFault({ equipmentId: 5, description: "no enfría" });

    expect(supabase.from).toHaveBeenCalledWith("solicitudes");
    expect(insertSolicitud).toHaveBeenCalledWith({
      eq_id_equipo: 5,
      p_legajo_solicitante: "u1",
      sol_descripcion: "no enfría",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("sync_equipo_estado", { p_eq_id: 5 });
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({ eq_id_equipo: 5, hi_tipo: "Reporte", hi_autor_id: "u1" }),
    );
    expect(result).toEqual({
      id: 1,
      equipment_id: 5,
      reported_by: "u1",
      description: "no enfría",
      status: "new",
      technician_id: null,
      priority: null,
      photo_url: null,
      photo_urls: [],
      created_at: "2026-01-01T00:00:00Z",
    });
  });

  it("uploads several photos, in order, when given", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
    const single = jest.fn().mockResolvedValue({
      data: {
        sol_id_solicitud: 1,
        eq_id_equipo: 5,
        p_legajo_solicitante: "u1",
        sol_descripcion: "no enfría",
        sol_foto_url: null,
        sol_fecha_hora: "2026-01-01T00:00:00Z",
        orden_de_trabajo: [],
      },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insertSolicitud = jest.fn().mockReturnValue({ select });
    const insertFotos = jest.fn().mockResolvedValue({ error: null });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "historial") return { insert: insertHistorial };
      if (table === "solicitud_foto") return { insert: insertFotos };
      return { insert: insertSolicitud };
    });

    const result = await createFault({
      equipmentId: 5,
      description: "no enfría",
      photoUrls: ["a.webp", "b.webp"],
    });

    expect(insertFotos).toHaveBeenCalledWith([
      { sol_id_solicitud: 1, sf_foto_url: "a.webp", sf_orden: 0 },
      { sol_id_solicitud: 1, sf_foto_url: "b.webp", sf_orden: 1 },
    ]);
    expect(result.photo_urls).toEqual(["a.webp", "b.webp"]);
    expect(result.photo_url).toBe("a.webp");
  });

  it("throws when there is no session", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    await expect(createFault({ equipmentId: 5, description: "x" })).rejects.toThrow(
      "Necesitás iniciar sesión para reportar una falla.",
    );
  });

  it("rejects invalid equipment and blank descriptions before writing", async () => {
    (supabase.auth.getSession as jest.Mock).mockClear();

    await expect(createFault({ equipmentId: 0, description: "x" })).rejects.toThrow(
      "El equipo seleccionado no es válido.",
    );

    await expect(createFault({ equipmentId: 5, description: "   " })).rejects.toThrow(
      "Describí la falla para poder registrarla.",
    );

    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });
});

describe("listMyRequests", () => {
  it("filters by p_legajo_solicitante = current user, ordered by sol_fecha_hora desc", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          sol_id_solicitud: 1,
          eq_id_equipo: 5,
          p_legajo_solicitante: "u1",
          sol_descripcion: "no enfría",
          sol_foto_url: null,
          sol_fecha_hora: "2026-01-01T00:00:00Z",
          orden_de_trabajo: [],
          solicitud_foto: [],
        },
      ],
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listMyRequests();

    expect(supabase.from).toHaveBeenCalledWith("solicitudes");
    expect(select).toHaveBeenCalledWith("*, orden_de_trabajo(*), solicitud_foto(*)");
    expect(eq).toHaveBeenCalledWith("p_legajo_solicitante", "u1");
    expect(order).toHaveBeenCalledWith("sol_fecha_hora", { ascending: false });
    expect(result).toEqual([
      {
        id: 1,
        equipment_id: 5,
        reported_by: "u1",
        description: "no enfría",
        status: "new",
        technician_id: null,
        priority: null,
        photo_url: null,
        photo_urls: [],
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
  });
});

describe("listAllRequests", () => {
  it("returns all solicitudes ordered by sol_fecha_hora desc", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          sol_id_solicitud: 1,
          eq_id_equipo: 5,
          p_legajo_solicitante: "u1",
          sol_descripcion: "a",
          sol_foto_url: null,
          sol_fecha_hora: "2026-01-01T00:00:00Z",
          orden_de_trabajo: [],
        },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listAllRequests();

    expect(supabase.from).toHaveBeenCalledWith("solicitudes");
    expect(select).toHaveBeenCalledWith("*, orden_de_trabajo(*), solicitud_foto(*)");
    expect(order).toHaveBeenCalledWith("sol_fecha_hora", { ascending: false });
    expect(result).toHaveLength(1);
  });
});

describe("listWorkQueue", () => {
  it("merges solicitudes pendientes (unassigned, no priority yet) with orders assigned to the current user (priority from ot_prioridad)", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const pendingRow = {
      sol_id_solicitud: 1,
      eq_id_equipo: 5,
      p_legajo_solicitante: "u1",
      sol_descripcion: "no enfría",
      sol_foto_url: null,
      sol_fecha_hora: "2026-01-01T00:00:00Z",
      orden_de_trabajo: [],
    };
    const mineRow = {
      sol_id_solicitud: 2,
      eq_id_equipo: 6,
      p_legajo_solicitante: "u2",
      sol_descripcion: "ruido raro",
      sol_foto_url: null,
      sol_fecha_hora: "2026-01-02T00:00:00Z",
      orden_de_trabajo: [
        { ot_estado: "assigned", ot_p_id_responsable: "tec1", ot_prioridad: "high" },
      ],
    };
    const order = jest
      .fn()
      .mockResolvedValueOnce({ data: [pendingRow], error: null })
      .mockResolvedValueOnce({ data: [mineRow], error: null });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listWorkQueue();

    expect(select).toHaveBeenCalledWith("*, orden_de_trabajo(*), solicitud_foto(*)");
    expect(select).toHaveBeenCalledWith("*, orden_de_trabajo!inner(*), solicitud_foto(*)");
    expect(eq).toHaveBeenCalledWith("sol_estado", "pendiente");
    expect(eq).toHaveBeenCalledWith("orden_de_trabajo.ot_p_id_responsable", "tec1");
    expect(result).toEqual([
      {
        id: 1,
        equipment_id: 5,
        reported_by: "u1",
        description: "no enfría",
        status: "new",
        technician_id: null,
        priority: null,
        photo_url: null,
        photo_urls: [],
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: 2,
        equipment_id: 6,
        reported_by: "u2",
        description: "ruido raro",
        status: "assigned",
        technician_id: "tec1",
        priority: "high",
        photo_url: null,
        photo_urls: [],
        created_at: "2026-01-02T00:00:00Z",
      },
    ]);
  });
});

describe("assignToMe", () => {
  it("creates an orden_de_trabajo with priority 'medium' by default, marks the solicitud en_proceso, syncs equipo status and logs historial", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const selectSingle = jest.fn().mockResolvedValue({
      data: { eq_id_equipo: 5, sol_descripcion: "no enfría" },
      error: null,
    });
    const selectEq = jest.fn().mockReturnValue({ single: selectSingle });
    const select = jest.fn().mockReturnValue({ eq: selectEq });
    const insertOrdenSingle = jest
      .fn()
      .mockResolvedValue({ data: { ot_id_orden: 7 }, error: null });
    const insertOrdenSelect = jest.fn().mockReturnValue({ single: insertOrdenSingle });
    const insertOrden = jest.fn().mockReturnValue({ select: insertOrdenSelect });
    const insertFalloPorOrden = jest.fn().mockResolvedValue({ error: null });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "orden_de_trabajo") return { insert: insertOrden };
      if (table === "fallo_por_orden") return { insert: insertFalloPorOrden };
      if (table === "historial") return { insert: insertHistorial };
      return { select, update };
    });

    // No options passed: taking the order without a diagnosis or an
    // explicit priority yet.
    await assignToMe(1);

    expect(selectEq).toHaveBeenCalledWith("sol_id_solicitud", 1);
    expect(insertOrden).toHaveBeenCalledWith({
      sol_id_solicitud: 1,
      eq_id_equipo: 5,
      ot_p_id_responsable: "tec1",
      ot_prioridad: "medium",
    });
    expect(insertFalloPorOrden).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ sol_estado: "en_proceso" });
    expect(updateEq).toHaveBeenCalledWith("sol_id_solicitud", 1);
    expect(supabase.rpc).toHaveBeenCalledWith("sync_equipo_estado", { p_eq_id: 5 });
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({ eq_id_equipo: 5, hi_tipo: "Asignada", hi_autor_id: "tec1" }),
    );
  });

  it("uses the priority and fallo genérico diagnosed at assignment time, linking the fallo via fallo_por_orden", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const selectSingle = jest.fn().mockResolvedValue({
      data: { eq_id_equipo: 5, sol_descripcion: "no enfría" },
      error: null,
    });
    const selectEq = jest.fn().mockReturnValue({ single: selectSingle });
    const select = jest.fn().mockReturnValue({ eq: selectEq });
    const insertOrdenSingle = jest
      .fn()
      .mockResolvedValue({ data: { ot_id_orden: 7 }, error: null });
    const insertOrdenSelect = jest.fn().mockReturnValue({ single: insertOrdenSingle });
    const insertOrden = jest.fn().mockReturnValue({ select: insertOrdenSelect });
    const insertFalloPorOrden = jest.fn().mockResolvedValue({ error: null });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "orden_de_trabajo") return { insert: insertOrden };
      if (table === "fallo_por_orden") return { insert: insertFalloPorOrden };
      if (table === "historial") return { insert: insertHistorial };
      return { select, update };
    });

    await assignToMe(1, { faultTypeId: 9, priority: "high" });

    expect(insertOrden).toHaveBeenCalledWith(expect.objectContaining({ ot_prioridad: "high" }));
    expect(insertFalloPorOrden).toHaveBeenCalledWith({
      fa_id_fallo: 9,
      ot_id_orden: 7,
      fpo_fecha_deteccion: expect.any(String),
    });
  });
});

describe("advanceStatus", () => {
  it("updates ot_estado on the orden_de_trabajo tied to the solicitud, then syncs equipo status and logs historial", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const single = jest.fn().mockResolvedValue({
      data: { eq_id_equipo: 5, solicitudes: { sol_descripcion: "no enfría" } },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "historial" ? { insert: insertHistorial } : { update },
    );

    await advanceStatus(1, "in_progress");

    expect(update).toHaveBeenCalledWith({ ot_estado: "in_progress" });
    expect(eq).toHaveBeenCalledWith("sol_id_solicitud", 1);
    expect(supabase.rpc).toHaveBeenCalledWith("sync_equipo_estado", { p_eq_id: 5 });
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({ eq_id_equipo: 5, hi_tipo: "En curso", hi_autor_id: "tec1" }),
    );
  });

  it("throws when Supabase returns an error", async () => {
    const single = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await expect(advanceStatus(1, "resolved")).rejects.toThrow("boom");
  });
});
