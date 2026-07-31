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
  it("inserts a fault with reported_by from the current session, then syncs equipment status", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
    const single = jest.fn().mockResolvedValue({
      data: {
        id: "f1",
        equipment_id: "e1",
        description: "no enfría",
        urgency: "high",
        status: "new",
      },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    const result = await createFault({
      equipmentId: "e1",
      description: "no enfría",
      urgency: "high",
    });

    expect(supabase.from).toHaveBeenCalledWith("faults");
    expect(insert).toHaveBeenCalledWith({
      equipment_id: "e1",
      description: "no enfría",
      urgency: "high",
      reported_by: "u1",
      status: "new",
      photo_url: null,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("sync_equipment_status", { p_equipment_id: "e1" });
    expect(result).toEqual({
      id: "f1",
      equipment_id: "e1",
      description: "no enfría",
      urgency: "high",
      status: "new",
    });
  });

  it("throws when there is no session", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    await expect(
      createFault({ equipmentId: "e1", description: "x", urgency: "low" }),
    ).rejects.toThrow("no session");
  });
});

describe("listMyRequests", () => {
  it("filters by reported_by = current user, ordered by created_at desc", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
    const order = jest.fn().mockResolvedValue({ data: [{ id: "f1" }], error: null });
    const eq = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listMyRequests();

    expect(supabase.from).toHaveBeenCalledWith("faults");
    expect(eq).toHaveBeenCalledWith("reported_by", "u1");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([{ id: "f1" }]);
  });
});

describe("listAllRequests", () => {
  it("returns all faults ordered by created_at desc", async () => {
    const order = jest.fn().mockResolvedValue({ data: [{ id: "f1" }, { id: "f2" }], error: null });
    const select = jest.fn().mockReturnValue({ order });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listAllRequests();

    expect(supabase.from).toHaveBeenCalledWith("faults");
    expect(select).toHaveBeenCalledWith("*");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([{ id: "f1" }, { id: "f2" }]);
  });
});

describe("listWorkQueue", () => {
  it("filters to faults assigned to the current user or unassigned/new, ordered by created_at desc", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const order = jest.fn().mockResolvedValue({ data: [{ id: "f1", status: "new" }], error: null });
    const or = jest.fn().mockReturnValue({ order });
    const select = jest.fn().mockReturnValue({ or });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await listWorkQueue();

    expect(or).toHaveBeenCalledWith("technician_id.eq.tec1,status.eq.new");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result).toEqual([{ id: "f1", status: "new" }]);
  });
});

describe("assignToMe", () => {
  it("sets technician_id to current user and status to assigned, then syncs equipment status and logs history", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const single = jest.fn().mockResolvedValue({
      data: { equipment_id: "e1", description: "no enfría" },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    const insert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "history" ? { insert } : { update },
    );

    await assignToMe("f1");

    expect(update).toHaveBeenCalledWith({ technician_id: "tec1", status: "assigned" });
    expect(eq).toHaveBeenCalledWith("id", "f1");
    expect(supabase.rpc).toHaveBeenCalledWith("sync_equipment_status", { p_equipment_id: "e1" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ equipment_id: "e1", type: "Asignada", author_id: "tec1" }),
    );
  });
});

describe("advanceStatus", () => {
  it("updates the status column for the given fault, then syncs equipment status and logs history", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "tec1" } } },
    });
    const single = jest.fn().mockResolvedValue({
      data: { equipment_id: "e1", description: "no enfría" },
      error: null,
    });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    const insert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      table === "history" ? { insert } : { update },
    );

    await advanceStatus("f1", "in_progress");

    expect(update).toHaveBeenCalledWith({ status: "in_progress" });
    expect(eq).toHaveBeenCalledWith("id", "f1");
    expect(supabase.rpc).toHaveBeenCalledWith("sync_equipment_status", { p_equipment_id: "e1" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ equipment_id: "e1", type: "En curso", author_id: "tec1" }),
    );
  });

  it("throws when Supabase returns an error", async () => {
    const single = jest.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ update });

    await expect(advanceStatus("f1", "resolved")).rejects.toThrow("boom");
  });
});
