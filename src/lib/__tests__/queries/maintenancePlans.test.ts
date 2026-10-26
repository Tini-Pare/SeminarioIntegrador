import {
  createMaintenancePlan,
  deactivateMaintenancePlan,
  deleteMaintenancePlan,
  listActiveEquipmentByType,
  listMaintenancePlans,
  updateMaintenancePlan,
} from "../../queries/maintenancePlans";
import { supabase } from "../../supabase";

jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

describe("listMaintenancePlans", () => {
  it("fetches plans from v_planes_mantenimiento ordered by plan name", async () => {
    const mockOrder = jest.fn().mockResolvedValue({
      data: [
        {
          pm_id_plan: 1,
          te_id: 10,
          te_nombre: "Aire Acondicionado",
          pm_nombre_plan: "Plan A",
          pm_descripcion_plan: "Desc A",
          pm_frecuencia: 30,
          pm_estado: "activo",
          task_count: 2,
          equipment_count: 5,
          prox_vencimiento: "2026-11-01",
        },
      ],
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ order: mockOrder });

    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    const result = await listMaintenancePlans();

    expect(supabase.from).toHaveBeenCalledWith("v_planes_mantenimiento");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockOrder).toHaveBeenCalledWith("pm_nombre_plan");
    expect(result).toHaveLength(1);
    expect(result[0].pm_nombre_plan).toBe("Plan A");
  });

  it("throws error when query fails", async () => {
    const mockOrder = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "Database connection failed" },
    });
    const mockSelect = jest.fn().mockReturnValue({ order: mockOrder });

    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    await expect(listMaintenancePlans()).rejects.toThrow("Database connection failed");
  });
});

describe("listActiveEquipmentByType", () => {
  it("fetches active, installed equipment by type with locations", async () => {
    const mockOrder = jest.fn().mockResolvedValue({
      data: [
        {
          eq_id_equipo: 1,
          eq_codigo: "AC-101",
          eq_nombre: "Split Piso 1",
          lugares: { lu_nombre_sector: "Oficina A" },
        },
      ],
      error: null,
    });
    const mockEqPending = jest.fn().mockReturnValue({ order: mockOrder });
    const mockEqStatus = jest.fn().mockReturnValue({ eq: mockEqPending });
    const mockEqType = jest.fn().mockReturnValue({ eq: mockEqStatus });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEqType });

    (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

    const result = await listActiveEquipmentByType(10);

    expect(supabase.from).toHaveBeenCalledWith("equipo");
    expect(mockEqType).toHaveBeenCalledWith("te_id", 10);
    expect(mockEqStatus).toHaveBeenCalledWith("eq_estado_registro", "activo");
    expect(mockEqPending).toHaveBeenCalledWith("eq_pendiente_instalacion", false);
    expect(result).toEqual([
      {
        id: 1,
        code: "AC-101",
        name: "Split Piso 1",
        location: "Oficina A",
      },
    ]);
  });
});

describe("createMaintenancePlan", () => {
  it("calls crear_plan_mantenimiento RPC with formatted arguments and no equipo dates", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: 42,
      error: null,
    });

    const input = {
      typeId: 2,
      name: "Plan Trimestral",
      description: "Revision y filtros",
      frequency: 90,
      estado: "activo" as const,
      taskIds: [1, 2],
    };

    const newId = await createMaintenancePlan(input);

    expect(supabase.rpc).toHaveBeenCalledWith("crear_plan_mantenimiento", {
      p_te_id: 2,
      p_nombre: "Plan Trimestral",
      p_descripcion: "Revision y filtros",
      p_frecuencia: 90,
      p_estado: "activo",
      p_tareas: [1, 2],
      p_equipos: [],
    });
    expect(newId).toBe(42);
  });

  it("throws error when RPC returns an error", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "Un plan activo debe tener al menos una tarea prevista" },
    });

    await expect(
      createMaintenancePlan({
        typeId: 2,
        name: "Plan Vacío",
        frequency: 30,
        estado: "activo",
        taskIds: [],
      }),
    ).rejects.toThrow("Un plan activo debe tener al menos una tarea prevista");
  });
});

describe("updateMaintenancePlan", () => {
  it("calls editar_plan_mantenimiento RPC without any equipo dates", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: null,
    });

    await updateMaintenancePlan(5, {
      typeId: 2,
      name: "Plan Modificado",
      description: null,
      frequency: 60,
      estado: "inactivo",
      taskIds: [1],
    });

    expect(supabase.rpc).toHaveBeenCalledWith("editar_plan_mantenimiento", {
      p_pm_id: 5,
      p_nombre: "Plan Modificado",
      p_descripcion: null,
      p_frecuencia: 60,
      p_estado: "inactivo",
      p_tareas: [1],
      p_equipos: [],
    });
  });
});

describe("deleteMaintenancePlan", () => {
  it("calls eliminar_plan_mantenimiento RPC", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: true,
      error: null,
    });

    await deleteMaintenancePlan(5);
    expect(supabase.rpc).toHaveBeenCalledWith("eliminar_plan_mantenimiento", {
      p_pm_id: 5,
    });
  });

  it("propagates error when plan has associated work orders", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        message:
          "HAS_WORK_ORDERS: El plan tiene órdenes de trabajo asociadas y no puede ser eliminado físicamente. Debe darse de baja.",
      },
    });

    await expect(deleteMaintenancePlan(5)).rejects.toThrow("HAS_WORK_ORDERS");
  });
});

describe("deactivateMaintenancePlan", () => {
  it("updates plan state to inactivo", async () => {
    const mockEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });

    (supabase.from as jest.Mock).mockReturnValue({ update: mockUpdate });

    await deactivateMaintenancePlan(5);

    expect(supabase.from).toHaveBeenCalledWith("plan_mantenimiento");
    expect(mockUpdate).toHaveBeenCalledWith({ pm_estado: "inactivo" });
    expect(mockEq).toHaveBeenCalledWith("pm_id_plan", 5);
  });
});
