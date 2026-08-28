jest.mock("../../supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import {
  createGenericFault,
  listGenericFaults,
  setGenericFaultActive,
} from "../../queries/genericFaults";
import { supabase } from "../../supabase";

describe("generic fault queries", () => {
  it("lists faults ordered by name", async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          fa_id_fallo: 1,
          fa_nombre: "Fuga",
          fa_desperfecto: "Pérdida de aceite",
          fa_activo: true,
        },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listGenericFaults();

    expect(supabase.from).toHaveBeenCalledWith("fallo");
    expect(select).toHaveBeenCalledWith("fa_id_fallo, fa_nombre, fa_desperfecto, fa_activo");
    expect(order).toHaveBeenCalledWith("fa_nombre");
    expect(result[0].fa_activo).toBe(true);
  });

  it("creates a fault with trimmed values", async () => {
    const single = jest.fn().mockResolvedValue({
      data: { fa_id_fallo: 2, fa_nombre: "Ruido", fa_activo: true },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await createGenericFault({
      name: " Ruido ",
      damage: "  Rodamiento desgastado ",
    });

    expect(insert).toHaveBeenCalledWith({
      fa_nombre: "Ruido",
      fa_desperfecto: "Rodamiento desgastado",
    });
  });

  it("changes active state without deleting the row", async () => {
    const stateEq = jest.fn().mockResolvedValue({ error: null });
    const stateUpdate = jest.fn().mockReturnValue({ eq: stateEq });
    (supabase.from as jest.Mock).mockReturnValue({ update: stateUpdate });

    await setGenericFaultActive(3, false);

    expect(stateUpdate).toHaveBeenCalledWith({ fa_activo: false });
    expect(stateEq).toHaveBeenCalledWith("fa_id_fallo", 3);
  });
});
