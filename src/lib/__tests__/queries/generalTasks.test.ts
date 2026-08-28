jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  createGeneralTask,
  listGeneralTasks,
  setGeneralTaskActive,
  updateGeneralTask,
} from "../../queries/generalTasks";
import { supabase } from "../../supabase";

describe("general task queries", () => {
  it("lists tasks ordered by name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          tag_id_tarea: 1,
          tag_nombre_tarea: "Limpiar filtro",
          tag_descripcion_tarea: null,
          tag_activo: true,
        },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listGeneralTasks();

    expect(supabase.from).toHaveBeenCalledWith("tareas_generales");
    expect(select).toHaveBeenCalledWith("*");
    expect(order).toHaveBeenCalledWith("tag_nombre_tarea");
    expect(result[0].tag_activo).toBe(true);
  });

  it("creates a task with trimmed values", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { tag_id_tarea: 2, tag_nombre_tarea: "Lubricar", tag_activo: true },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await createGeneralTask({ name: " Lubricar ", description: "  Cada mes  " });

    expect(insert).toHaveBeenCalledWith({
      tag_nombre_tarea: "Lubricar",
      tag_descripcion_tarea: "Cada mes",
    });
  });

  it("updates task details and active state without deleting the row", async () => {
    const detailEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq: detailEq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateGeneralTask(3, { name: " Revisar bomba ", description: null });

    expect(update).toHaveBeenCalledWith({
      tag_nombre_tarea: "Revisar bomba",
      tag_descripcion_tarea: null,
    });
    expect(detailEq).toHaveBeenCalledWith("tag_id_tarea", 3);

    const stateEq = jest.fn().mockResolvedValue({ error: null });
    const stateUpdate = jest.fn().mockReturnValue({ eq: stateEq });
    (supabase.from as jest.Mock).mockReturnValue({ update: stateUpdate });

    await setGeneralTaskActive(3, false);

    expect(stateUpdate).toHaveBeenCalledWith({ tag_activo: false });
    expect(stateEq).toHaveBeenCalledWith("tag_id_tarea", 3);
  });
});
