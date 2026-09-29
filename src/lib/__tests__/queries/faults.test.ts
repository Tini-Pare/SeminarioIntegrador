jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
    auth: { getSession: jest.fn() },
    rpc: jest.fn(),
  },
}));

import {
  addTaskToOrder,
  closeSolicitud,
  createFault,
  finishTask,
  generateOrder,
  getSolicitudById,
  listActiveTaskCountsByTechnician,
  listAllRequests,
  listMyRequests,
  listMyTasks,
  reassignTaskTechnician,
  startTask,
  updateOrderStartDate,
} from "../../queries/faults";
import { supabase } from "../../supabase";

const SOLICITUD_SELECT =
  "*, orden_de_trabajo(*, fallo_por_orden(fallo(*)), tareas_realizadas_orden(*, tareas_generales(tag_nombre_tarea))), solicitud_foto(*)";

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
      priority: null,
      order_id: null,
      order_start_date: null,
      order_end_date: null,
      order_planned_end_date: null,
      fault_type_name: null,
      tasks: [],
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
    expect(select).toHaveBeenCalledWith(SOLICITUD_SELECT);
    expect(eq).toHaveBeenCalledWith("p_legajo_solicitante", "u1");
    expect(order).toHaveBeenCalledWith("sol_fecha_hora", { ascending: false });
    expect(result).toEqual([
      {
        id: 1,
        equipment_id: 5,
        reported_by: "u1",
        description: "no enfría",
        status: "new",
        priority: null,
        order_id: null,
        order_start_date: null,
        order_end_date: null,
        order_planned_end_date: null,
        fault_type_name: null,
        tasks: [],
        photo_url: null,
        photo_urls: [],
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
  });
});

describe("listAllRequests", () => {
  it("returns every solicitud (admin-only), each with its tareas (one técnico each), or none if closed without an OT", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          sol_id_solicitud: 1,
          eq_id_equipo: 5,
          p_legajo_solicitante: "u1",
          sol_descripcion: "a",
          sol_foto_url: null,
          sol_estado: "resuelta",
          sol_fecha_hora: "2026-01-01T00:00:00Z",
          orden_de_trabajo: [],
        },
        {
          sol_id_solicitud: 2,
          eq_id_equipo: 6,
          p_legajo_solicitante: "u2",
          sol_descripcion: "b",
          sol_foto_url: null,
          sol_estado: "en_proceso",
          sol_fecha_hora: "2026-01-02T00:00:00Z",
          orden_de_trabajo: [
            {
              ot_id_orden: 9,
              ot_estado: "assigned",
              ot_prioridad: "high",
              ot_fecha_inicio: "2026-01-03",
              ot_fecha_fin: null,
              fallo_por_orden: [{ fallo: { fa_id_fallo: 3, fa_nombre: "Pérdida de gas" } }],
              tareas_realizadas_orden: [
                {
                  taro_id_tarea_orden: 20,
                  tag_id_tarea: 4,
                  p_id_tecnico: "tec1",
                  taro_fecha_inicio: null,
                  taro_fecha_fin: null,
                  tareas_generales: { tag_nombre_tarea: "Cambio de gas" },
                },
                {
                  taro_id_tarea_orden: 21,
                  tag_id_tarea: 5,
                  p_id_tecnico: "tec2",
                  taro_fecha_inicio: "2026-01-04",
                  taro_fecha_fin: null,
                  tareas_generales: { tag_nombre_tarea: "Limpieza de filtro" },
                },
              ],
            },
          ],
        },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listAllRequests();

    expect(supabase.from).toHaveBeenCalledWith("solicitudes");
    expect(select).toHaveBeenCalledWith(SOLICITUD_SELECT);
    // Closed without an OT (SCRUM-27): no orden_de_trabajo row, but
    // sol_estado is already resuelta — status must read "resolved", tasks empty.
    expect(result[0]).toEqual(
      expect.objectContaining({ id: 1, status: "resolved", priority: null, tasks: [] }),
    );
    // Has an order with two tareas, each with its own técnico and dates.
    expect(result[1]).toEqual(
      expect.objectContaining({
        id: 2,
        status: "assigned",
        priority: "high",
        order_id: 9,
        fault_type_name: "Pérdida de gas",
        tasks: [
          {
            id: 20,
            taskId: 4,
            taskName: "Cambio de gas",
            technicianId: "tec1",
            startDate: null,
            endDate: null,
          },
          {
            id: 21,
            taskId: 5,
            taskName: "Limpieza de filtro",
            technicianId: "tec2",
            startDate: "2026-01-04",
            endDate: null,
          },
        ],
      }),
    );
  });
});

describe("getSolicitudById", () => {
  it("returns the solicitud mapped with its tareas, for the OT full-screen page", async () => {
    const single = jest.fn().mockResolvedValue({
      data: {
        sol_id_solicitud: 2,
        eq_id_equipo: 6,
        p_legajo_solicitante: "u2",
        sol_descripcion: "b",
        sol_foto_url: null,
        sol_fecha_hora: "2026-01-02T00:00:00Z",
        orden_de_trabajo: [
          {
            ot_id_orden: 9,
            ot_estado: "assigned",
            ot_prioridad: "high",
            ot_fecha_inicio: "2026-01-03",
            ot_fecha_fin: null,
            fallo_por_orden: [],
            tareas_realizadas_orden: [],
          },
        ],
      },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await getSolicitudById(2);

    expect(supabase.from).toHaveBeenCalledWith("solicitudes");
    expect(select).toHaveBeenCalledWith(SOLICITUD_SELECT);
    expect(eq).toHaveBeenCalledWith("sol_id_solicitud", 2);
    expect(result).toEqual(expect.objectContaining({ id: 2, order_id: 9, priority: "high" }));
  });

  it("returns null when no solicitud matches that id", async () => {
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "no rows" },
    });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(getSolicitudById(999)).resolves.toBeNull();
  });
});

describe("closeSolicitud", () => {
  it("closes a pendiente solicitud without an order, syncs equipo status and logs historial with the reason", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { eq_id_equipo: 5, sol_estado: "pendiente" },
      error: null,
    });
    const selectEq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq: selectEq });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "admin1" } } },
    });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "historial" ? { insert: insertHistorial } : { select, update },
    );

    await closeSolicitud(1, "duplicada");

    expect(update).toHaveBeenCalledWith({ sol_estado: "resuelta" });
    expect(updateEq).toHaveBeenCalledWith("sol_id_solicitud", 1);
    expect(supabase.rpc).toHaveBeenCalledWith("sync_equipo_estado", { p_eq_id: 5 });
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({
        eq_id_equipo: 5,
        hi_tipo: "Cerrada",
        hi_nota: expect.stringContaining("duplicada"),
        hi_autor_id: "admin1",
      }),
    );
  });

  it("requires a reason", async () => {
    await expect(closeSolicitud(1, "   ")).rejects.toThrow("Indicá el motivo del cierre.");
  });

  it("refuses to close a solicitud that isn't pendiente anymore", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { eq_id_equipo: 5, sol_estado: "en_proceso" },
      error: null,
    });
    const selectEq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq: selectEq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(closeSolicitud(1, "duplicada")).rejects.toThrow(
      "Esta solicitud ya no está pendiente.",
    );
  });
});

describe("generateOrder", () => {
  it("creates la OT sin ot_p_id_responsable, agrega cada tarea con su propio técnico, marca la solicitud en_proceso y loguea historial", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "admin1" } } },
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
    const insertTareas = jest.fn().mockResolvedValue({ error: null });
    const insertFallo = jest.fn().mockResolvedValue({ error: null });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "orden_de_trabajo") return { insert: insertOrden };
      if (table === "tareas_realizadas_orden") return { insert: insertTareas };
      if (table === "fallo_por_orden") return { insert: insertFallo };
      if (table === "historial") return { insert: insertHistorial };
      return { select, update };
    });

    await generateOrder(1, {
      tasks: [
        { taskId: 3, technicianId: "tec1" },
        { taskId: 4, technicianId: "tec2" },
      ],
      faultTypeId: 9,
      priority: "high",
    });

    expect(selectEq).toHaveBeenCalledWith("sol_id_solicitud", 1);
    expect(insertOrden).toHaveBeenCalledWith({
      sol_id_solicitud: 1,
      eq_id_equipo: 5,
      ot_prioridad: "high",
    });
    expect(insertTareas).toHaveBeenCalledWith([
      { ot_id_orden: 7, tag_id_tarea: 3, p_id_tecnico: "tec1" },
      { ot_id_orden: 7, tag_id_tarea: 4, p_id_tecnico: "tec2" },
    ]);
    expect(insertFallo).toHaveBeenCalledWith({
      fa_id_fallo: 9,
      ot_id_orden: 7,
      fpo_fecha_deteccion: expect.any(String),
    });
    expect(update).toHaveBeenCalledWith({ sol_estado: "en_proceso" });
    expect(supabase.rpc).toHaveBeenCalledWith("sync_equipo_estado", { p_eq_id: 5 });
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({ eq_id_equipo: 5, hi_tipo: "Asignada", hi_autor_id: "admin1" }),
    );
  });

  it("defaults to prioridad media and no fallo when not given", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "admin1" } } },
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
    const insertTareas = jest.fn().mockResolvedValue({ error: null });
    const insertFallo = jest.fn().mockResolvedValue({ error: null });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "orden_de_trabajo") return { insert: insertOrden };
      if (table === "tareas_realizadas_orden") return { insert: insertTareas };
      if (table === "fallo_por_orden") return { insert: insertFallo };
      if (table === "historial") return { insert: insertHistorial };
      return { select, update };
    });

    await generateOrder(1, { tasks: [{ taskId: 3, technicianId: "tec1" }] });

    expect(insertOrden).toHaveBeenCalledWith(expect.objectContaining({ ot_prioridad: "medium" }));
    expect(insertFallo).not.toHaveBeenCalled();
  });

  it("requires at least one tarea", async () => {
    await expect(generateOrder(1, { tasks: [] })).rejects.toThrow(
      "Agregá al menos una tarea con su técnico.",
    );
  });
});

describe("addTaskToOrder", () => {
  it("agrega una tarea a una OT existente y loguea historial con el nombre de la tarea", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "admin1" } } },
    });
    const ordenSingle = jest
      .fn()
      .mockResolvedValue({ data: { ot_id_orden: 7, eq_id_equipo: 5 }, error: null });
    const ordenEq = jest.fn().mockReturnValue({ single: ordenSingle });
    const ordenSelect = jest.fn().mockReturnValue({ eq: ordenEq });

    const taskSingle = jest.fn().mockResolvedValue({
      data: { tareas_generales: { tag_nombre_tarea: "Cambio de filtro" } },
      error: null,
    });
    const taskSelect = jest.fn().mockReturnValue({ single: taskSingle });
    const insertTask = jest.fn().mockReturnValue({ select: taskSelect });

    const insertHistorial = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "tareas_realizadas_orden") return { insert: insertTask };
      if (table === "historial") return { insert: insertHistorial };
      return { select: ordenSelect };
    });

    await addTaskToOrder(1, { taskId: 4, technicianId: "tec2" });

    expect(ordenEq).toHaveBeenCalledWith("sol_id_solicitud", 1);
    expect(insertTask).toHaveBeenCalledWith({
      ot_id_orden: 7,
      tag_id_tarea: 4,
      p_id_tecnico: "tec2",
    });
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({
        eq_id_equipo: 5,
        hi_tipo: "Asignada",
        hi_nota: expect.stringContaining("Cambio de filtro"),
      }),
    );
  });
});

describe("reassignTaskTechnician", () => {
  it("updates p_id_tecnico on the tarea and logs historial", async () => {
    const updateSingle = jest.fn().mockResolvedValue({
      data: {
        tareas_generales: { tag_nombre_tarea: "Cambio de compresor" },
        orden_de_trabajo: { eq_id_equipo: 5 },
      },
      error: null,
    });
    const updateSelect = jest.fn().mockReturnValue({ single: updateSingle });
    const updateEq = jest.fn().mockReturnValue({ select: updateSelect });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "historial" ? { insert: insertHistorial } : { update },
    );

    await reassignTaskTechnician(4, "tec3");

    expect(update).toHaveBeenCalledWith({ p_id_tecnico: "tec3" });
    expect(updateEq).toHaveBeenCalledWith("taro_id_tarea_orden", 4);
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({
        eq_id_equipo: 5,
        hi_tipo: "Reasignada",
        hi_nota: expect.stringContaining("Cambio de compresor"),
      }),
    );
  });
});

describe("listActiveTaskCountsByTechnician", () => {
  it("counts tareas sin finalizar per técnico", async () => {
    const notFn = jest.fn().mockResolvedValue({
      data: [{ p_id_tecnico: "tec1" }, { p_id_tecnico: "tec1" }, { p_id_tecnico: "tec2" }],
      error: null,
    });
    const isFn = jest.fn().mockReturnValue({ not: notFn });
    const select = jest.fn().mockReturnValue({ is: isFn });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listActiveTaskCountsByTechnician();

    expect(isFn).toHaveBeenCalledWith("taro_fecha_fin", null);
    expect(notFn).toHaveBeenCalledWith("p_id_tecnico", "is", null);
    expect(result).toEqual({ tec1: 2, tec2: 1 });
  });
});

describe("updateOrderStartDate", () => {
  it("updates ot_fecha_inicio and logs historial", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "admin1" } } },
    });
    const single = jest.fn().mockResolvedValue({ data: { eq_id_equipo: 5 }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "historial" ? { insert: insertHistorial } : { update },
    );

    await updateOrderStartDate(1, "2026-02-01");

    expect(update).toHaveBeenCalledWith({ ot_fecha_inicio: "2026-02-01" });
    expect(eq).toHaveBeenCalledWith("sol_id_solicitud", 1);
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({ eq_id_equipo: 5, hi_tipo: "Replanificada" }),
    );
  });
});

describe("listMyTasks", () => {
  it("returns one row per tarea assigned to the current técnico, with its OT/solicitud/equipo context", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const eqFn = jest.fn().mockResolvedValue({
      data: [
        {
          taro_id_tarea_orden: 11,
          ot_id_orden: 7,
          tag_id_tarea: 3,
          p_id_tecnico: "tec1",
          taro_fecha_inicio: null,
          taro_fecha_fin: null,
          tareas_generales: { tag_nombre_tarea: "Cambio de gas" },
          orden_de_trabajo: {
            ot_estado: "assigned",
            ot_prioridad: "high",
            eq_id_equipo: 5,
            fallo_por_orden: [{ fallo: { fa_nombre: "Pérdida de gas" } }],
            solicitudes: {
              sol_descripcion: "no enfría",
              p_legajo_solicitante: "u1",
              sol_fecha_hora: "2026-01-01T00:00:00Z",
              sol_foto_url: null,
              solicitud_foto: [],
            },
          },
        },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ eq: eqFn });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listMyTasks();

    expect(supabase.from).toHaveBeenCalledWith("tareas_realizadas_orden");
    expect(eqFn).toHaveBeenCalledWith("p_id_tecnico", "tec1");
    expect(result).toEqual([
      {
        taskRowId: 11,
        taskName: "Cambio de gas",
        orderId: 7,
        orderStatus: "assigned",
        priority: "high",
        startDate: null,
        endDate: null,
        equipmentId: 5,
        description: "no enfría",
        reportedBy: "u1",
        createdAt: "2026-01-01T00:00:00Z",
        photoUrl: null,
        photoUrls: [],
        faultTypeName: "Pérdida de gas",
      },
    ]);
  });
});

describe("startTask", () => {
  it("lets the assigned técnico start their own tarea, logging historial", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const checkSingle = jest.fn().mockResolvedValue({
      data: {
        p_id_tecnico: "tec1",
        ot_id_orden: 7,
        tareas_generales: { tag_nombre_tarea: "Cambio de gas" },
        orden_de_trabajo: { eq_id_equipo: 5 },
      },
      error: null,
    });
    const checkEq = jest.fn().mockReturnValue({ single: checkSingle });
    const checkSelect = jest.fn().mockReturnValue({ eq: checkEq });
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "historial" ? { insert: insertHistorial } : { select: checkSelect, update },
    );

    await startTask(11);

    expect(checkEq).toHaveBeenCalledWith("taro_id_tarea_orden", 11);
    expect(update).toHaveBeenCalledWith({ taro_fecha_inicio: expect.any(String) });
    expect(updateEq).toHaveBeenCalledWith("taro_id_tarea_orden", 11);
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({
        eq_id_equipo: 5,
        hi_tipo: "En curso",
        hi_nota: expect.stringContaining("Cambio de gas"),
      }),
    );
  });

  it("refuses to start a tarea that isn't assigned to the current user (e.g. the admin)", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "admin1" } } },
    });
    const checkSingle = jest.fn().mockResolvedValue({
      data: {
        p_id_tecnico: "tec1",
        ot_id_orden: 7,
        tareas_generales: null,
        orden_de_trabajo: null,
      },
      error: null,
    });
    const checkEq = jest.fn().mockReturnValue({ single: checkSingle });
    const checkSelect = jest.fn().mockReturnValue({ eq: checkEq });
    const update = jest.fn();
    (supabase.from as jest.Mock).mockReturnValue({ select: checkSelect, update });

    await expect(startTask(11)).rejects.toThrow(
      "Solo el técnico asignado puede iniciar esta tarea.",
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe("finishTask", () => {
  function mockFinishChecks(
    checkData: Record<string, unknown>,
    siblingsData: { taro_fecha_fin: string | null }[],
  ) {
    const checkSingle = jest.fn().mockResolvedValue({ data: checkData, error: null });
    const checkEq = jest.fn().mockReturnValue({ single: checkSingle });

    const siblingsEq = jest.fn().mockResolvedValue({ data: siblingsData, error: null });

    const select = jest
      .fn()
      .mockImplementation((cols: string) =>
        cols === "taro_fecha_fin" ? { eq: siblingsEq } : { eq: checkEq },
      );
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: updateEq });
    const insertHistorial = jest.fn().mockResolvedValue({ error: null });

    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "historial" ? { insert: insertHistorial } : { select, update },
    );

    return { checkEq, updateEq, update, insertHistorial, siblingsEq };
  }

  it("refuses to finish a tarea that isn't assigned to the current user", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "admin1" } } },
    });
    mockFinishChecks({ p_id_tecnico: "tec1", ot_id_orden: 7, taro_fecha_inicio: "2026-01-01" }, []);

    await expect(finishTask(11)).rejects.toThrow(
      "Solo el técnico asignado puede finalizar esta tarea.",
    );
  });

  it("refuses to finish a tarea that was never started", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    mockFinishChecks({ p_id_tecnico: "tec1", ot_id_orden: 7, taro_fecha_inicio: null }, []);

    await expect(finishTask(11)).rejects.toThrow("Iniciá la tarea antes de finalizarla.");
  });

  it("finishes the tarea and logs historial, without a 'Resuelta' entry when other tareas are still open", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const { update, updateEq, insertHistorial } = mockFinishChecks(
      {
        p_id_tecnico: "tec1",
        ot_id_orden: 7,
        taro_fecha_inicio: "2026-01-01",
        tareas_generales: { tag_nombre_tarea: "Cambio de gas" },
        orden_de_trabajo: { eq_id_equipo: 5 },
      },
      [{ taro_fecha_fin: "2026-01-05" }, { taro_fecha_fin: null }],
    );

    await finishTask(11);

    expect(update).toHaveBeenCalledWith({ taro_fecha_fin: expect.any(String) });
    expect(updateEq).toHaveBeenCalledWith("taro_id_tarea_orden", 11);
    expect(insertHistorial).toHaveBeenCalledTimes(1);
    expect(insertHistorial).toHaveBeenCalledWith(
      expect.objectContaining({ eq_id_equipo: 5, hi_tipo: "Tarea finalizada" }),
    );
  });

  it("also logs a 'Resuelta' entry when it was the last tarea pendiente of the OT", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const { insertHistorial } = mockFinishChecks(
      {
        p_id_tecnico: "tec1",
        ot_id_orden: 7,
        taro_fecha_inicio: "2026-01-01",
        tareas_generales: { tag_nombre_tarea: "Cambio de gas" },
        orden_de_trabajo: { eq_id_equipo: 5 },
      },
      [{ taro_fecha_fin: "2026-01-05" }],
    );

    await finishTask(11);

    expect(insertHistorial).toHaveBeenCalledTimes(2);
    expect(insertHistorial).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ hi_tipo: "Tarea finalizada" }),
    );
    expect(insertHistorial).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ eq_id_equipo: 5, hi_tipo: "Resuelta" }),
    );
  });
});
