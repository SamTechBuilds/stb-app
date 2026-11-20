import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { installMock, seed, sha256 } from "./mock-supabase";

const shots = process.env.SHOTS === "1";
const fx = (f: string) => join(import.meta.dirname, "fixtures", f);

test("owner prepares, publishes and shares a delivery end to end", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1366, height: 900 });
  const db = seed();
  await installMock(page, db);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hello, Asif" })).toBeVisible();

  // client
  await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Clients" }).click();
  await page.getByRole("link", { name: "Add your first client" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Priya Raman");
  await page.getByLabel("Business name").fill("Priya's Bakehouse");
  await page.getByLabel("Email").fill("priya@example.com");
  await page.getByLabel("Internal notes").fill("Prefers WhatsApp. Pays on time.");
  await page.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByText("Client added", { exact: true })).toBeVisible();

  // project + support period
  await page.getByRole("link", { name: "Add project" }).click();
  await page.getByLabel("Project name").fill("Bakehouse website");
  await page.getByLabel("Technologies").fill("React, Vite, Supabase");
  await page.getByLabel("Live URL").fill("https://priyasbakehouse.example");
  await page.getByLabel("Internal notes").fill("Budget 45k. Domain renewal March.");
  await page.getByRole("button", { name: "Add project" }).click();
  await expect(page.getByText("Project added", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add support period" }).click();
  await page.getByLabel("Terms the client will see").fill("Bug fixes and two small content changes a month.");
  await page.getByRole("button", { name: "Save support period" }).click();
  await expect(page.getByText("Support period saved", { exact: true })).toBeVisible();

  // delivery draft from the project
  await page.getByRole("link", { name: "Create delivery" }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Bakehouse website" })).toBeVisible();
  await expect(page.getByLabel("Name on the gift tag")).toHaveValue("Priya");
  const created = db.tables.deliveries[0];
  expect(JSON.stringify(created)).not.toMatch(/Budget 45k|Prefers WhatsApp/); // internal notes never copied

  // content edit + save
  await page.getByLabel("Welcome message").fill("Thank you for trusting us with your first website.");
  await page.getByLabel("Summary").fill("A fast menu and WhatsApp ordering site.");
  await page.getByRole("radio", { name: "Aurora" }).check();
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Checklist item 1").fill("Domain connected");
  await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled(); // unsaved changes block publishing
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved", { exact: true })).toBeVisible();
  expect(db.tables.deliveries[0].theme).toBe("aurora");
  expect(db.tables.deliveries[0].handover_checklist).toEqual([{ label: "Domain connected", done: true }]);

  // uploads
  await page.locator('input[type=file][aria-label="Add screenshots"]').setInputFiles([fx("home.png"), fx("menu.png")]);
  await expect(page.getByText("2 files uploaded", { exact: true })).toBeVisible();
  await page.locator('input[type=file][aria-label="Add files"]').setInputFiles(fx("guide.pdf"));
  await expect(page.getByText("File uploaded", { exact: true })).toBeVisible();
  expect(db.tables.delivery_assets.map((a) => a.kind).sort()).toEqual(["document", "screenshot", "screenshot"]);
  for (const a of db.tables.delivery_assets) expect(String(a.storage_path)).toMatch(new RegExp(`^${created.id}/[0-9a-f]{12}-`));
  await expect(page.getByText("Main screenshot", { exact: true })).toBeVisible();

  // preview opens the delivery site with a short-lived preview token
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Preview" }).click();
  const win = await popup;
  await win.waitForURL(/delivery\.example\/#[A-Za-z0-9_-]{43}$/).catch(() => {});
  expect(db.rpcCalls.find((c) => c.fn === "issue_delivery_token")?.args.p_kind).toBe("preview");
  await win.close();

  // publish
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Live\. Anyone holding a client link/)).toBeVisible();

  // client link: plaintext shown once, only its hash reaches the server
  await page.getByLabel("Label (only you see it)").fill("WhatsApp to Priya");
  await page.getByLabel("Expires").selectOption("90");
  await page.getByRole("button", { name: "Create client link" }).click();
  const link = await page.getByLabel("Client link", { exact: true }).inputValue();
  expect(link).toMatch(/^https:\/\/delivery\.example\/#[A-Za-z0-9_-]{43}$/);
  const token = link.split("#")[1];
  const call = db.rpcCalls.filter((c) => c.fn === "issue_delivery_token").at(-1)!;
  expect(call.args.p_token_hash).toBe(sha256(token));
  expect(JSON.stringify(db.rpcCalls)).not.toContain(token);
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  if (shots) await page.screenshot({ path: "test-results/app-1-editor-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Done" }).click();

  // revoke that link
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke link" }).click();
  await expect(page.getByText("Link revoked", { exact: true })).toBeVisible();
  expect(db.tables.delivery_tokens.find((t) => t.kind === "client")?.revoked_at).toBeTruthy();

  // list view
  await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Deliveries" }).click();
  await expect(page.getByRole("link", { name: /Bakehouse website/ })).toBeVisible();
  if (shots) await page.screenshot({ path: "test-results/app-2-list-desktop.png" });
});

test("mobile layout and dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const db = seed();
  db.tables.clients.push({ id: "c1", name: "Priya Raman", business_name: "Priya's Bakehouse", status: "active", created_at: "", updated_at: "" });
  db.tables.projects.push({ id: "p1", client_id: "c1", name: "Bakehouse website", status: "completed", tech_stack: ["React"], created_at: "", updated_at: "" });
  db.tables.deliveries.push({ id: "d1", project_id: "p1", status: "published", theme: "midnight", client_display_name: "Priya", business_display_name: "Priya's Bakehouse",
    project_title: "Bakehouse website", tech_list: ["React"], handover_checklist: [], open_count: 3, last_opened_at: new Date(Date.now() - 3600_000).toISOString(),
    first_opened_at: new Date(Date.now() - 86400_000).toISOString(), published_at: new Date().toISOString(), revoked_at: null, support_period_id: null,
    created_at: "", updated_at: "" });
  await installMock(page, db);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hello, Asif" })).toBeVisible();
  if (shots) await page.screenshot({ path: "test-results/app-3-overview-mobile.png" });
  await page.locator(".tabbar").getByRole("link", { name: "Deliveries" }).click();
  await page.getByRole("link", { name: /Bakehouse website/ }).click();
  await expect(page.getByLabel("Name on the gift tag")).toHaveValue("Priya");
  if (shots) await page.screenshot({ path: "test-results/app-4-editor-mobile.png", fullPage: true });
  await page.locator(".topbar select").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  if (shots) await page.screenshot({ path: "test-results/app-5-editor-dark.png" });
});

test("signed-out visitors see the sign-in form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
