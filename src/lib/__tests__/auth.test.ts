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
  it("returns no error on success", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ error: null });
    const result = await signIn("a@b.com", "pw");
    expect(result.error).toBeNull();
  });

  it("returns the error message on failure", async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const result = await signIn("a@b.com", "wrong");
    expect(result.error).toBe("Invalid login credentials");
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
