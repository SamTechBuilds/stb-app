// An in-memory stand-in for the parts of Supabase the app calls, so the admin flow can be driven in a
// real browser. It mimics PostgREST/Storage shapes, not their security: RLS is tested in stb-core.
import type { Page, Route } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SUPA = "https://mockref.supabase.co";
const OWNER = { id: "11111111-1111-4111-8111-111111111111", email: "owner@samtechbuilds.example" };

type Row = Record<string, unknown>;
export interface MockDb {
  tables: Record<string, Row[]>;
  rpcCalls: { fn: string; args: Row }[];
  storage: Map<string, number>;
}

function jwt(payload: Row) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.sig`;
}

export function sessionJson() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = jwt({ sub: OWNER.id, email: OWNER.email, role: "authenticated", aud: "authenticated", aal: "aal1",
    amr: [{ method: "password", timestamp: exp - 100 }], exp, session_id: "s1" });
  return JSON.stringify({
    access_token: access, refresh_token: "r1", token_type: "bearer", expires_in: 3600, expires_at: exp,
    user: { id: OWNER.id, email: OWNER.email, aud: "authenticated", role: "authenticated", factors: [], app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  });
}

const now = () => new Date().toISOString();

export function seed(): MockDb {
  return {
    rpcCalls: [],
    storage: new Map(),
    tables: {
      staff: [{ user_id: OWNER.id, email: OWNER.email, role: "owner", is_active: true, display_name: "Asif" }],
      business_profile: [{ id: 1, brand_name: "Sam Tech Builds", tagline: null, person_name: null, role_title: null, phone: null, whatsapp: null,
        email: null, website: "https://samtechbuilds.netlify.app", location: null, services: [], socials: [], support_hours: null }],
      clients: [], projects: [], support_periods: [], deliveries: [], delivery_assets: [], delivery_tokens: [], delivery_events: [],
    },
  };
}

function withEmbeds(db: MockDb, table: string, rows: Row[]): Row[] {
  const client = (id: unknown) => db.tables.clients.find((c) => c.id === id) ?? null;
  const project = (id: unknown) => db.tables.projects.find((p) => p.id === id) ?? null;
  if (table === "projects") return rows.map((r) => ({ ...r, clients: client(r.client_id) }));
  if (table === "deliveries") return rows.map((r) => {
    const p = project(r.project_id);
    return { ...r, projects: p ? { ...p, clients: client(p.client_id) } : null };
  });
  return rows;
}

function filterRows(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(k)) continue;
    if (v.startsWith("eq.")) out = out.filter((r) => String(r[k]) === v.slice(3));
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (dir === "desc" ? -1 : 1));
  }
  return out;
}

function respond(route: Route, accept: string, data: Row[] | Row | null, status = 200) {
  const single = accept.includes("vnd.pgrst.object");
  const body = single ? (Array.isArray(data) ? data[0] ?? null : data) : data;
  if (single && !body) return route.fulfill({ status: 406, json: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } });
  return route.fulfill({ status, json: body, headers: { "content-range": "0-0/*" } });
}

const DEFAULTS: Record<string, () => Row> = {
  clients: () => ({ status: "active", business_name: null, email: null, phone: null, address: null, notes: null }),
  projects: () => ({ status: "in_progress", tech_stack: [], category: null, description: null, live_url: null, internal_notes: null, start_date: null, due_date: null, completed_on: null }),
  deliveries: () => ({ status: "draft", open_count: 0, published_at: null, revoked_at: null, first_opened_at: null, last_opened_at: null, handover_checklist: [] }),
  delivery_assets: () => ({ is_published: true, description: null, sort_order: 0 }),
};

export async function installMock(page: Page, db: MockDb) {
  await page.addInitScript((s) => localStorage.setItem("stb-app-auth", s), sessionJson());

  await page.route(`${SUPA}/auth/v1/**`, (route) => {
    const url = route.request().url();
    if (url.includes("/user")) return route.fulfill({ json: JSON.parse(sessionJson()).user });
    if (url.includes("/factors")) return route.fulfill({ json: { all: [], totp: [], phone: [] } });
    return route.fulfill({ status: 204, body: "" });
  });

  await page.route(`${SUPA}/rest/v1/rpc/**`, (route) => {
    const fn = new URL(route.request().url()).pathname.split("/").pop()!;
    const args = JSON.parse(route.request().postData() ?? "{}");
    db.rpcCalls.push({ fn, args });
    if (fn === "issue_delivery_token") {
      const id = randomUUID();
      db.tables.delivery_tokens.push({ id, delivery_id: args.p_delivery_id, kind: args.p_kind, label: args.p_label, token_hint: args.p_token_hint,
        token_hash: args.p_token_hash, expires_at: args.p_expires_at, revoked_at: null, created_at: now(), last_used_at: null, use_count: 0 });
      return route.fulfill({ json: id });
    }
    if (fn === "set_delivery_status") {
      const d = db.tables.deliveries.find((x) => x.id === args.p_delivery_id)!;
      d.status = args.p_status;
      if (args.p_status === "published") d.published_at = now();
      d.revoked_at = args.p_status === "revoked" ? now() : null;
      if (args.p_status === "revoked") db.tables.delivery_tokens.filter((t) => t.delivery_id === d.id).forEach((t) => (t.revoked_at ??= now()));
      return route.fulfill({ json: args.p_status });
    }
    if (fn === "revoke_delivery_token") {
      const t = db.tables.delivery_tokens.find((x) => x.id === args.p_token_id)!;
      t.revoked_at = now();
      return route.fulfill({ json: null });
    }
    return route.fulfill({ status: 404, json: { message: `unknown rpc ${fn}` } });
  });

  await page.route(`${SUPA}/rest/v1/*`, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/").pop()!;
    const accept = req.headers()["accept"] ?? "";
    const rows = db.tables[table];
    if (!rows) return route.fulfill({ status: 404, json: { message: `no table ${table}` } });
    const method = req.method();
    if (method === "GET") return respond(route, accept, withEmbeds(db, table, filterRows(rows, url.searchParams)));
    if (method === "POST") {
      const body = JSON.parse(req.postData() ?? "{}");
      const created = (Array.isArray(body) ? body : [body]).map((b) => {
        const row = { id: randomUUID(), created_at: now(), updated_at: now(), ...(DEFAULTS[table]?.() ?? {}), ...b };
        rows.push(row);
        return row;
      });
      return respond(route, accept, withEmbeds(db, table, created), 201);
    }
    if (method === "PATCH") {
      const body = JSON.parse(req.postData() ?? "{}");
      const hit = filterRows(rows, url.searchParams);
      hit.forEach((r) => Object.assign(r, body, { updated_at: now() }));
      return respond(route, accept, withEmbeds(db, table, hit));
    }
    if (method === "DELETE") {
      const hit = new Set(filterRows(rows, url.searchParams));
      db.tables[table] = rows.filter((r) => !hit.has(r));
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 405, body: "" });
  });

  await page.route(`${SUPA}/storage/v1/**`, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(sign\/)?delivery-files\/?/, ""));
    if (url.pathname.includes("/object/sign/") && req.method() === "POST") {
      return route.fulfill({ json: { signedURL: `/object/sign/delivery-files/${path}?token=t` } });
    }
    if (url.pathname.includes("/object/sign/") && req.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "image/png", body: readFileSync(join(import.meta.dirname, "fixtures", "home.png")) });
    }
    if (req.method() === "POST" || req.method() === "PUT") {
      db.storage.set(path, req.postDataBuffer()?.length ?? 0);
      return route.fulfill({ json: { Key: `delivery-files/${path}`, Id: randomUUID() } });
    }
    if (req.method() === "DELETE") {
      const body = JSON.parse(req.postData() ?? "{}");
      for (const p of body.prefixes ?? []) db.storage.delete(p);
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ status: 404, body: "" });
  });
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
