jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  createGeneralTask,
  deleteGeneralTask,
  listGeneralTasks,
  updateGeneralTask,
} from "../../queries/generalTasks";
import { supabase } from "../../supabase";

describe("listGeneralTasks", () => {
  it("returns tasks ordered by name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        { tag_id_tarea: 1, tag_nombre_tarea: "Calibrar termostato", tag_descripcion_tarea: null },
        {
          tag_id_tarea: 2,
          tag_nombre_tarea: "Limpiar filtros",
          tag_descripcion_tarea: "Lavar a presión",
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
    expect(result).toHaveLength(2);
  });

  it("throws when Supabase returns an error", async () => {
    const order = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(listGeneralTasks()).rejects.toThrow("boom");
  });
});

describe("createGeneralTask", () => {
  it("inserts trimmed name and description, returns the row", async () => {
    const single = jest.fn().mockResolvedValue({
      data: {
        tag_id_tarea: 5,
        tag_nombre_tarea: "Purgar radiador",
        tag_descripcion_tarea: "Con llave",
      },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    const result = await createGeneralTask({
      name: "  Purgar radiador  ",
      description: "  Con llave  ",
    });

    expect(insert).toHaveBeenCalledWith({
      tag_nombre_tarea: "Purgar radiador",
      tag_descripcion_tarea: "Con llave",
    });
    expect(result.tag_id_tarea).toBe(5);
  });

  it("stores an empty description as null", async () => {
    const single = jest.fn().mockResolvedValue({ data: {}, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await createGeneralTask({ name: "X", description: "   " });

    expect(insert).toHaveBeenCalledWith({ tag_nombre_tarea: "X", tag_descripcion_tarea: null });
  });

  it("maps a 23505 unique violation to the duplicate-name message", async () => {
    const single = jest
      .fn()
      .mockResolvedValue({
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "tareas_generales_nombre_unico_idx"',
        },
      });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await expect(createGeneralTask({ name: "Repetida", description: null })).rejects.toThrow(
      "Ya existe una tarea general con ese nombre",
    );
  });

  it("rethrows a 23505 primary-key collision as-is (not a duplicate name)", async () => {
    const single = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "tareas_generales_pkey"',
      },
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await expect(createGeneralTask({ name: "Nueva", description: null })).rejects.toThrow(
      "tareas_generales_pkey",
    );
  });
});

describe("updateGeneralTask", () => {
  it("updates name and description for the given id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await updateGeneralTask(5, { name: " Nueva ", description: null });

    expect(update).toHaveBeenCalledWith({
      tag_nombre_tarea: "Nueva",
      tag_descripcion_tarea: null,
    });
    expect(eq).toHaveBeenCalledWith("tag_id_tarea", 5);
  });

  it("throws when Supabase returns an error", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { message: "update failed" } });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await expect(updateGeneralTask(5, { name: "X", description: null })).rejects.toThrow(
      "update failed",
    );
  });

  it("maps a 23505 unique violation to the duplicate-name message", async () => {
    const eq = jest.fn().mockResolvedValue({
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "tareas_generales_nombre_unico_idx"',
      },
    });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await expect(updateGeneralTask(5, { name: "Repetida", description: null })).rejects.toThrow(
      "Ya existe una tarea general con ese nombre",
    );
  });
});

describe("deleteGeneralTask", () => {
  it("deletes by id", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await deleteGeneralTask(5);

    expect(eq).toHaveBeenCalledWith("tag_id_tarea", 5);
  });

  it("maps a 23503 FK violation to a friendly message", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "23503", message: "fk" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteGeneralTask(5)).rejects.toThrow(/ya está usada en un plan/);
  });

  it("rethrows other errors as-is", async () => {
    const eq = jest.fn().mockResolvedValue({ error: { code: "500", message: "server error" } });
    const del = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ delete: del });

    await expect(deleteGeneralTask(5)).rejects.toThrow("server error");
  });
});
