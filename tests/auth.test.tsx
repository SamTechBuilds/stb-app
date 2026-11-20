import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ aal: { currentLevel: "aal1", nextLevel: "aal1" } as Record<string, string>, staff: null as unknown, staffError: null as unknown }));
vi.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: { mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal, error: null }) } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.staff, error: state.staffError }) }) }) }),
  },
}));

import { resolveAuth } from "../src/features/auth/AuthProvider";
const session = { user: { id: "u1", email: "owner@stb.example" } } as never;

beforeEach(() => {
  state.aal = { currentLevel: "aal1", nextLevel: "aal1" };
  state.staff = { role: "owner", is_active: true, display_name: "Asif" };
  state.staffError = null;
});

describe("resolveAuth", () => {
  it("signs out when there is no session", async () => {
    expect(await resolveAuth(null)).toEqual({ kind: "signed_out" });
  });
  it("authorizes an active owner", async () => {
    expect((await resolveAuth(session)).kind).toBe("authorized");
  });
  it("asks for the TOTP code before checking anything else", async () => {
    state.aal = { currentLevel: "aal1", nextLevel: "aal2" };
    expect((await resolveAuth(session)).kind).toBe("mfa_required");
  });
  it("refuses non-staff, inactive staff and non-owner roles", async () => {
    for (const staff of [null, { role: "owner", is_active: false }, { role: "viewer", is_active: true }]) {
      state.staff = staff;
      expect((await resolveAuth(session)).kind).toBe("unauthorized");
    }
  });
  it("never grants access when verification fails", async () => {
    state.staff = { role: "owner", is_active: true };
    state.staffError = { message: "network" };
    expect((await resolveAuth(session)).kind).toBe("error");
  });
});
