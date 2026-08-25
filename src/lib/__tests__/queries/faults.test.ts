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
        sol_urgencia: "high",
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

    const result = await createFault({ equipmentId: 5, description: "no enfría", urgency: "high" });

    expect(supabase.from).toHaveBeenCalledWith("solicitudes");
    expect(insertSolicitud).toHaveBeenCalledWith({
      eq_id_equipo: 5,
      p_legajo_solicitante: "u1",
      sol_descripcion: "no enfría",
      sol_urgencia: "high",
      sol_foto_url: null,
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
      urgency: "high",
      status: "new",
      technician_id: null,
      photo_url: null,
      created_at: "2026-01-01T00:00:00Z",
    });
  });

  it("throws when there is no session", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    await expect(
      createFault({ equipmentId: 5, description: "x", urgency: "low" }),
    ).rejects.toThrow("no session");
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
          sol_urgencia: "high",
          sol_foto_url: null,
          sol_fecha_hora: "2026-01-01T00:00:00Z",
          orden_de_trabajo: [],
        },
      ],
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listMyRequests();

    expect(supabase.from).toHaveBeenCalledWith("solicitudes");
    expect(eq).toHaveBeenCalledWith("p_legajo_solicitante", "u1");
    expect(order).toHaveBeenCalledWith("sol_fecha_hora", { ascending: false });
    expect(result).toEqual([
      {
        id: 1,
        equipment_id: 5,
        reported_by: "u1",
        description: "no enfría",
        urgency: "high",
        status: "new",
        technician_id: null,
        photo_url: null,
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
          sol_urgencia: "low",
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
    expect(select).toHaveBeenCalledWith("*, orden_de_trabajo(*)");
    expect(order).toHaveBeenCalledWith("sol_fecha_hora", { ascending: false });
    expect(result).toHaveLength(1);
  });
});

describe("listWorkQueue", () => {
  it("merges solicitudes pendientes (unassigned) with orders assigned to the current user", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const pendingRow = {
      sol_id_solicitud: 1,
      eq_id_equipo: 5,
      p_legajo_solicitante: "u1",
      sol_descripcion: "no enfría",
      sol_urgencia: "high",
      sol_foto_url: null,
      sol_fecha_hora: "2026-01-01T00:00:00Z",
      orden_de_trabajo: [],
    };
    const mineRow = {
      sol_id_solicitud: 2,
      eq_id_equipo: 6,
      p_legajo_solicitante: "u2",
      sol_descripcion: "ruido raro",
      sol_urgencia: "low",
      sol_foto_url: null,
      sol_fecha_hora: "2026-01-02T00:00:00Z",
      orden_de_trabajo: [{ ot_estado: "assigned", ot_p_id_responsable: "tec1" }],
    };
    const order = jest
      .fn()
      .mockResolvedValueOnce({ data: [pendingRow], error: null })
      .mockResolvedValueOnce({ data: [mineRow], error: null });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listWorkQueue();

    expect(select).toHaveBeenCalledWith("*, orden_de_trabajo(*)");
    expect(select).toHaveBeenCalledWith("*, orden_de_trabajo!inner(*)");
    expect(eq).toHaveBeenCalledWith("sol_estado", "pendiente");
    expect(eq).toHaveBeenCalledWith("orden_de_trabajo.ot_p_id_responsable", "tec1");
    expect(result).toEqual([
      {
        id: 1,
        equipment_id: 5,
        reported_by: "u1",
        description: "no enfría",
        urgency: "high",
        status: "new",
        technician_id: null,
        photo_url: null,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: 2,
        equipment_id: 6,
        reported_by: "u2",
        description: "ruido raro",
        urgency: "low",
        status: "assigned",
        technician_id: "tec1",
        photo_url: null,
        created_at: "2026-01-02T00:00:00Z",
      },
    ]);
  });
});

describe("assignToMe", () => {
  it("creates an orden_de_trabajo for the current user, marks the solicitud en_proceso, syncs equipo status and logs historial", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const selectSingle = jest.fn().mockResolvedValue({
      data: { eq_id_equipo: 5, sol_descripcion: "no enfría", sol_urgencia: "high" },
      error: null,
    });
    const selectEq = jest.fn().mockReturnValue({ single: selectSingle });
    const select = jest.fn().mockReturnValue({ eq: selectEq });
    const insertOrden = jest.fn().mockResolvedValue({ error: null });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "orden_de_trabajo") return { insert: insertOrden };
      if (table === "historial") return { insert: insertHistorial };
      return { select, update };
    });

    await assignToMe(1);

    expect(selectEq).toHaveBeenCalledWith("sol_id_solicitud", 1);
    expect(insertOrden).toHaveBeenCalledWith({
      sol_id_solicitud: 1,
      eq_id_equipo: 5,
      ot_p_id_responsable: "tec1",
      ot_prioridad: "high",
    });
    expect(update).toHaveBeenCalledWith({ sol_estado: "en_proceso" });
    expect(updateEq).toHaveBeenCalledWith("sol_id_solicitud", 1);
    expect(supabase.rpc).toHaveBeenCalledWith("sync_equipo_estado", { p_eq_id: 5 });
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({ eq_id_equipo: 5, hi_tipo: "Asignada", hi_autor_id: "tec1" }),
    );
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
