jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

import {
  createEquipment,
  deleteEquipment,
  getEquipmentById,
  isActiveFault,
  listEquipment,
  listFaultHistoryByEquipment,
  summarizeFaultHistory,
  updateEquipment,
} from "../../queries/equipment";
import { SOLICITUD_SELECT } from "../../queries/faults";
import { supabase } from "../../supabase";
import type { Solicitud } from "../../../types/database";

function fault(overrides: Partial<Solicitud>): Solicitud {
  return {
    id: 1,
    equipment_id: 1,
    reported_by: "u1",
    description: "No enfría",
    status: "new",
    motivo_rechazo: null,
    comentario_rechazo: null,
    priority: null,
    order_id: null,
    order_start_date: null,
    order_end_date: null,
    order_planned_end_date: null,
    fault_type_name: null,
    tasks: [],
    photo_url: null,
    photo_urls: [],
    created_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

describe("listFaultHistoryByEquipment", () => {
  it("returns every solicitud of the equipo (closed ones too) with tareas, diagnóstico and repuestos", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          sol_id_solicitud: 10,
          eq_id_equipo: 1,
          p_legajo_solicitante: "u1",
          sol_descripcion: "Pierde agua",
          sol_estado: "resuelta",
          sol_motivo_rechazo: null,
          sol_comentario_rechazo: null,
          sol_foto_url: null,
          sol_fecha_hora: "2026-10-05T09:00:00Z",
          solicitud_foto: [],
          orden_de_trabajo: [
            {
              ot_id_orden: 27,
              ot_estado: "resolved",
              ot_prioridad: "high",
              ot_fecha_inicio: "2026-10-05",
              ot_fecha_fin: "2026-10-06",
              ot_fecha_estimada_fin: null,
              fallo_por_orden: [{ fallo: { fa_nombre: "Fuga de gas" } }],
              tareas_realizadas_orden: [
                {
                  taro_id_tarea_orden: 5,
                  tag_id_tarea: 2,
                  p_id_tecnico: "t1",
                  taro_fecha_inicio: "2026-10-05",
                  taro_fecha_fin: "2026-10-06",
                  taro_diagnostico: "Válvula dañada",
                  tareas_generales: { tag_nombre_tarea: "Cambiar válvula" },
                  repuesto_para_tarea: [
                    { rep_id: 3, repta_canti_usada: 1, repuestos: { rep_nombre: "Válvula" } },
                  ],
                },
              ],
            },
          ],
        },
        {
          sol_id_solicitud: 9,
          eq_id_equipo: 1,
          p_legajo_solicitante: "u2",
          sol_descripcion: "Ruido",
          sol_estado: "rechazada",
          sol_motivo_rechazo: "Duplicada",
          sol_comentario_rechazo: null,
          sol_foto_url: null,
          sol_fecha_hora: "2026-09-01T09:00:00Z",
          solicitud_foto: [],
          orden_de_trabajo: [],
        },
      ],
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listFaultHistoryByEquipment(1);

    expect(supabase.from).toHaveBeenCalledWith("solicitudes");
    expect(select).toHaveBeenCalledWith(SOLICITUD_SELECT);
    expect(eq).toHaveBeenCalledWith("eq_id_equipo", 1);
    expect(order).toHaveBeenCalledWith("sol_fecha_hora", { ascending: false });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 10,
      status: "resolved",
      order_id: 27,
      order_end_date: "2026-10-06",
      fault_type_name: "Fuga de gas",
      tasks: [
        {
          taskName: "Cambiar válvula",
          technicianId: "t1",
          diagnosis: "Válvula dañada",
          consumedParts: [{ repId: 3, nombre: "Válvula", cantidad: 1 }],
        },
      ],
    });
    expect(result[1]).toMatchObject({ id: 9, status: "rejected", motivo_rechazo: "Duplicada" });
  });

  it("throws when Supabase returns an error", async () => {
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listFaultHistoryByEquipment(1)).rejects.toThrow("boom");
  });
});

describe("isActiveFault", () => {
  it("treats resolved and closed-without-OT solicitudes as not active", () => {
    expect(isActiveFault(fault({ status: "new" }))).toBe(true);
    expect(isActiveFault(fault({ status: "assigned" }))).toBe(true);
    expect(isActiveFault(fault({ status: "in_progress" }))).toBe(true);
    expect(isActiveFault(fault({ status: "resolved" }))).toBe(false);
    expect(isActiveFault(fault({ status: "rejected" }))).toBe(false);
  });
});

describe("summarizeFaultHistory", () => {
  it("counts total/active, finds the latest report and the most frequent fallo", () => {
    const summary = summarizeFaultHistory([
      fault({
        id: 4,
        status: "in_progress",
        fault_type_name: "Fuga",
        created_at: "2026-10-10T08:00:00Z",
      }),
      fault({
        id: 3,
        status: "resolved",
        fault_type_name: "Eléctrica",
        created_at: "2026-09-10T08:00:00Z",
      }),
      fault({
        id: 2,
        status: "resolved",
        fault_type_name: "Fuga",
        created_at: "2026-08-10T08:00:00Z",
      }),
      fault({
        id: 1,
        status: "rejected",
        fault_type_name: null,
        created_at: "2026-07-10T08:00:00Z",
      }),
    ]);

    expect(summary).toEqual({
      total: 4,
      active: 1,
      lastReportedAt: "2026-10-10T08:00:00Z",
      mostFrequentType: { name: "Fuga", count: 2 },
    });
  });

  it("returns empty values for an equipo without faults", () => {
    expect(summarizeFaultHistory([])).toEqual({
      total: 0,
      active: 0,
      lastReportedAt: null,
      mostFrequentType: null,
    });
  });
});

describe("listEquipment", () => {
  it("returns equipo ordered by lugar name then codigo, mapped to the flat Equipo shape", async () => {
    const orderByCode = jest.fn().mockResolvedValue({
      data: [
        {
          eq_id_equipo: 1,
          te_id: 7,
          lu_codigo: 3,
          eq_codigo: "AC-014",
          eq_nombre: "Aire Acondicionado",
          eq_estado: "operational",
          eq_estado_registro: "activo",
          eq_modelo: "Split 3000F",
          eq_fecha_instalacion: "2026-01-15",
          lugares: { lu_nombre_sector: "Planta A" },
          tipos_de_equipos: { te_nombre: "Climatización" },
        },
      ],
      error: null,
    });
    const orderByLugar = jest.fn().mockReturnValue({ order: orderByCode });
    const select = jest.fn().mockReturnValue({ order: orderByLugar });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listEquipment();

    expect(supabase.from).toHaveBeenCalledWith("equipo");
    expect(select).toHaveBeenCalledWith("*, lugares(*), tipos_de_equipos(*)");
    expect(orderByLugar).toHaveBeenCalledWith("lu_nombre_sector", { referencedTable: "lugares" });
    expect(orderByCode).toHaveBeenCalledWith("eq_codigo");
    expect(result).toEqual([
      {
        id: 1,
        code: "AC-014",
        name: "Aire Acondicionado",
        type: "Climatización",
        typeId: 7,
        location: "Planta A",
        locationId: 3,
        status: "operational",
        active: true,
        model: "Split 3000F",
        installDate: "2026-01-15",
      },
    ]);
  });

  it("throws when Supabase returns an error", async () => {
    const orderByCode = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const orderByLugar = jest.fn().mockReturnValue({ order: orderByCode });
    const select = jest.fn().mockReturnValue({ order: orderByLugar });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listEquipment()).rejects.toThrow("boom");
  });
});

describe("getEquipmentById", () => {
  it("returns a single equipo row by id, mapped to the flat Equipo shape", async () => {
    const single = jest.fn().mockResolvedValue({
      data: {
        eq_id_equipo: 1,
        te_id: 7,
        lu_codigo: 3,
        eq_codigo: "AC-014",
        eq_nombre: "Aire Acondicionado",
        eq_estado: "operational",
        eq_estado_registro: "activo",
        eq_modelo: null,
        eq_fecha_instalacion: null,
        lugares: { lu_nombre_sector: "Planta A" },
        tipos_de_equipos: { te_nombre: "Climatización" },
      },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await getEquipmentById(1);

    expect(eq).toHaveBeenCalledWith("eq_id_equipo", 1);
    expect(result).toEqual({
      id: 1,
      code: "AC-014",
      name: "Aire Acondicionado",
      type: "Climatización",
      typeId: 7,
      location: "Planta A",
      locationId: 3,
      status: "operational",
      active: true,
      model: null,
      installDate: null,
    });
  });

  it("returns null when not found", async () => {
    const single = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "no rows", code: "PGRST116" } });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await getEquipmentById(999);

    expect(result).toBeNull();
  });
});

describe("mapEquipo (via getEquipmentById)", () => {
  it("shows a pending-installation equipo as pending_install, whatever its eq_estado", async () => {
    const single = jest.fn().mockResolvedValue({
      data: {
        eq_id_equipo: 2,
        te_id: 7,
        lu_codigo: 3,
        eq_codigo: "AC-016",
        eq_nombre: "AA Depósito",
        eq_estado: "waiting",
        eq_estado_registro: "activo",
        eq_pendiente_instalacion: true,
        eq_modelo: null,
        eq_fecha_instalacion: null,
        lugares: { lu_nombre_sector: "Depósito" },
        tipos_de_equipos: { te_nombre: "Climatización" },
      },
      error: null,
    });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await getEquipmentById(2);

    expect(result?.status).toBe("pending_install");
  });
});

describe("createEquipment", () => {
  const base = {
    code: "AC-015",
    name: "AA Sala",
    typeId: 7,
    locationId: 3,
    model: "Split 3000F",
  };

  it("registers an installed equipo through alta_equipo with its installation date", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { eq_id: 5, ot_id: null },
      error: null,
    });

    const result = await createEquipment({ ...base, pending: false, installDate: "2026-02-01" });

    expect(supabase.rpc).toHaveBeenCalledWith("alta_equipo", {
      p_codigo: "AC-015",
      p_nombre: "AA Sala",
      p_te_id: 7,
      p_lu_codigo: 3,
      p_modelo: "Split 3000F",
      p_pendiente: false,
      p_fecha_instalacion: "2026-02-01",
    });
    expect(result).toEqual({ equipmentId: 5, orderId: null });
  });

  it("registers a pending equipo with the técnico and prioridad of its installation OT", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { eq_id: 6, ot_id: 31 },
      error: null,
    });

    const result = await createEquipment({
      ...base,
      pending: true,
      technicianId: "tec1",
      priority: "high",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("alta_equipo", {
      p_codigo: "AC-015",
      p_nombre: "AA Sala",
      p_te_id: 7,
      p_lu_codigo: 3,
      p_modelo: "Split 3000F",
      p_pendiente: true,
      p_tecnico: "tec1",
      p_prioridad: "high",
    });
    expect(result).toEqual({ equipmentId: 6, orderId: 31 });
  });

  it("throws when Supabase returns an error", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "Elegí el técnico que va a instalar el equipo" },
    });

    await expect(
      createEquipment({ ...base, pending: true, technicianId: "", priority: "low" }),
    ).rejects.toThrow("Elegí el técnico que va a instalar el equipo");
  });

  it("translates duplicate eq_codigo unique constraint error to friendly Spanish message", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "equipo_eq_codigo_key"',
      },
    });

    await expect(
      createEquipment({ ...base, pending: false, installDate: "2026-02-01" }),
    ).rejects.toThrow("Ya existe un equipo con el código ingresado. Probá con otro código.");
  });
});

describe("updateEquipment", () => {
  it("updates te_id/lu_codigo directly for the given id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateEquipment(5, {
      code: "AC-015",
      name: "AA Sala",
      typeId: 9,
      locationId: 4,
      model: "Split 3000F",
      installDate: "2026-02-01",
    });

    expect(supabase.from).toHaveBeenCalledWith("equipo");
    expect(update).toHaveBeenCalledWith({
      eq_codigo: "AC-015",
      eq_nombre: "AA Sala",
      te_id: 9,
      lu_codigo: 4,
      eq_modelo: "Split 3000F",
      eq_fecha_instalacion: "2026-02-01",
    });
    expect(eq).toHaveBeenCalledWith("eq_id_equipo", 5);
  });

  it("throws when Supabase returns an error", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { message: "update failed" } });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await expect(
      updateEquipment(5, {
        code: "X",
        name: "Y",
        typeId: 1,
        locationId: 1,
        model: null,
        installDate: null,
      }),
    ).rejects.toThrow("update failed");
  });

  it("translates duplicate eq_codigo unique constraint error to friendly Spanish message", async () => {
    const eq = jest.fn().mockResolvedValue({
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "equipo_eq_codigo_key"',
      },
    });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await expect(
      updateEquipment(5, {
        code: "AC-015",
        name: "Y",
        typeId: 1,
        locationId: 1,
        model: null,
        installDate: null,
      }),
    ).rejects.toThrow("Ya existe un equipo con el código ingresado. Probá con otro código.");
  });
});

describe("deleteEquipment", () => {
  it("deletes equipo by eq_id_equipo", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const deleteFn = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: deleteFn });

    await deleteEquipment(5);

    expect(supabase.from).toHaveBeenCalledWith("equipo");
    expect(deleteFn).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("eq_id_equipo", 5);
  });

  it("throws when Supabase returns an error", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { message: "delete failed" } });
    const deleteFn = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: deleteFn });

    await expect(deleteEquipment(5)).rejects.toThrow("delete failed");
  });
});
