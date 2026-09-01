jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
    },
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

import { getProfile, signIn, signOut } from "../auth";
import { supabase } from "../supabase";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("signIn", () => {
  it("returns no error on success", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: "1234@legajo.local", error: null });
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ error: null });
    const result = await signIn("1234", "pw");
    expect(result.error).toBeNull();
  });

  it("does not process authentication when the legajo is blank", async () => {
    const result = await signIn("   ", "pw");
    expect(result.error).toBe("Completá el legajo y la contraseña para ingresar.");
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not process authentication when the password is blank", async () => {
    const result = await signIn("1234", "");
    expect(result.error).toBe("Completá el legajo y la contraseña para ingresar.");
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns a generic error when the legajo has no matching user", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
    const result = await signIn("9999", "pw");
    expect(result.error).toBe("Legajo o contraseña incorrectos");
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns a generic error when the password is wrong", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: "1234@legajo.local", error: null });
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const result = await signIn("1234", "wrong");
    expect(result.error).toBe("Legajo o contraseña incorrectos");
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
