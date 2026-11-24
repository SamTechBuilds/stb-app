// STUBBED BACKEND: password sign-in against e2e/mock-supabase.ts. Proves the screens and the client
// gate only. It does not prove Supabase Auth, RLS or real TOTP.
import { test, expect } from "@playwright/test";
import { installMock, seed, STUB_PASSWORD } from "./mock-supabase";

test("owner signs in with email and password, and a wrong password gets one generic message", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMock(page, seed(), { seeded: false });
  await page.goto("/");
  await page.getByLabel("Email").fill("owner@samtechbuilds.example");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("That email and password don't match an STB account.")).toBeVisible();

  await page.getByLabel("Password").fill(STUB_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Hello, Asif" })).toBeVisible();
});
