import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { base64url, checkUpload, deliveryLink, generateToken, storagePath } from "../src/lib/security";
import { prefillDelivery } from "../src/lib/api";
import { nullify, splitList, isHttps } from "../src/lib/forms";
import type { Project } from "../src/lib/types";

describe("link tokens", () => {
  it("are 32 random bytes as 43-char base64url, hashed with SHA-256 hex", async () => {
    const t = await generateToken();
    expect(t.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t.hash).toBe(createHash("sha256").update(t.token).digest("hex"));
    expect(t.hint).toBe(t.token.slice(-4));
    const again = await generateToken();
    expect(again.token).not.toBe(t.token);
  });
  it("encode bytes exactly like Node's base64url", () => {
    const bytes = new Uint8Array([251, 255, 0, 62, 63, 1, 2, 3]);
    expect(base64url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
  });
  it("go in the URL fragment", () => {
    expect(deliveryLink("https://delivery.samtechbuilds.com/", "T".repeat(43))).toBe(`https://delivery.samtechbuilds.com/#${"T".repeat(43)}`);
  });
});

describe("storage paths", () => {
  const id = "0b7a1c2e-1111-4222-8333-444455556666";
  const re = /^[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/; // same as the DB check constraint
  it("always satisfy the database constraint", () => {
    for (const name of ["Owner's Guide (v2).PDF", "../../etc/passwd", "ராஜா.png", ".hidden", "a".repeat(400) + ".zip", "noext"]) {
      const p = storagePath(id, name);
      expect(p, name).toMatch(re);
      expect(p.startsWith(id + "/")).toBe(true);
      expect(p).not.toContain("..");
    }
  });
});

describe("upload checks", () => {
  const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });
  it("allow images as screenshots and office files as documents only", () => {
    expect(checkUpload(file("a.png", "image/png"), "screenshot")).toBeNull();
    expect(checkUpload(file("a.svg", "image/svg+xml"), "screenshot")).toMatch(/PNG, JPEG or WebP/);
    expect(checkUpload(file("a.pdf", "application/pdf"), "document")).toBeNull();
    expect(checkUpload(file("a.html", "text/html"), "document")).toMatch(/isn't allowed/);
    expect(checkUpload(file("a.exe", "application/x-msdownload"), "document")).toMatch(/isn't allowed/);
    expect(checkUpload(file("e.pdf", "application/pdf", 0), "document")).toMatch(/empty/);
  });
});

describe("delivery prefill", () => {
  const project = {
    id: "p1", client_id: "c1", name: "Bakery site", tech_stack: ["React"], live_url: "http://insecure.example",
    description: "INTERNAL DESCRIPTION", internal_notes: "SECRET", completed_on: "2026-11-23", status: "completed",
  } as unknown as Project;
  it("copies safe facts and never internal ones", () => {
    const d = prefillDelivery(project, { name: "Priya Raman", business_name: "Priya Bakes" }, null);
    expect(d.client_display_name).toBe("Priya");
    expect(d.business_display_name).toBe("Priya Bakes");
    expect(d.project_title).toBe("Bakery site");
    expect(d.live_url).toBeNull(); // http links are not carried into a client page
    expect(JSON.stringify(d)).not.toMatch(/INTERNAL|SECRET/);
  });
});

describe("form helpers", () => {
  it("turn blanks into null and split lists", () => {
    expect(nullify({ a: " ", b: " x ", c: 3 })).toEqual({ a: null, b: "x", c: 3 });
    expect(splitList("React, Vite,\nSupabase,,")).toEqual(["React", "Vite", "Supabase"]);
    expect(isHttps("http://x")).toBe(false);
    expect(isHttps("")).toBe(true);
  });
});
