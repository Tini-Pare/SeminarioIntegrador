jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
    },
    from: jest.fn(),
  },
}));

import { getProfile, signIn, signOut } from "../auth";
import { supabase } from "../supabase";

describe("signIn", () => {
  it("returns no error on success when user is active", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ error: null });
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
    const single = jest
      .fn()
      .mockResolvedValue({ data: { id: "u1", role: "user", active: true }, error: null });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await signIn("a@b.com", "pw");
    expect(result.error).toBeNull();
  });

  it("blocks login and signs out when account is disabled / inactive", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ error: null });
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
    const single = jest
      .fn()
      .mockResolvedValue({ data: { id: "u1", role: "user", active: false }, error: null });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await signIn("a@b.com", "pw");
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(result.error).toBe(
      "El usuario se encuentra inhabilitado. Comuníquese con el administrador",
    );
  });

  it("translates invalid login credentials to Spanish on failure", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const result = await signIn("a@b.com", "wrong");
    expect(result.error).toBe(
      "El usuario se encuentra inhabilitado. Comuníquese con el administrador",
    );
  });

  it("passes through unmapped error messages as-is", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: { message: "Network connection lost" },
    });
    const result = await signIn("a@b.com", "pw");
    expect(result.error).toBe("Network connection lost");
  });
});

describe("getProfile", () => {
  it("returns null when there is no session", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    const result = await getProfile();
    expect(result).toBeNull();
  });

  it("fetches the profile row for the current user", async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
    });
    const single = jest
      .fn()
      .mockResolvedValue({ data: { id: "u1", role: "technician" }, error: null });
    const eq = jest.fn().mockReturnValue({ single });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    const result = await getProfile();

    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(eq).toHaveBeenCalledWith("id", "u1");
    expect(result).toEqual({ id: "u1", role: "technician" });
  });
});

describe("signOut", () => {
  it("calls supabase auth signOut", async () => {
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
    await signOut();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
