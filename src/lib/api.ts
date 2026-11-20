// Thin data access. Authorization lives in RLS and SQL functions; nothing here is a security boundary.
import { supabase, must, DELIVERY_BUCKET } from "./supabase";
import { generateToken, storagePath } from "./security";
import type {
  BusinessProfile, Client, Delivery, DeliveryAsset, DeliveryContent, DeliveryEvent, DeliveryStatus,
  DeliveryToken, Project, SupportPeriod,
} from "./types";

export const keys = {
  clients: ["clients"] as const,
  client: (id: string) => ["clients", id] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  support: (projectId: string) => ["support", projectId] as const,
  deliveries: ["deliveries"] as const,
  delivery: (id: string) => ["deliveries", id] as const,
  assets: (id: string) => ["assets", id] as const,
  tokens: (id: string) => ["tokens", id] as const,
  events: (id: string) => ["events", id] as const,
  profile: ["profile"] as const,
};

/* ---------- Clients ---------- */
export type ClientInput = Pick<Client, "name" | "business_name" | "email" | "phone" | "address" | "notes" | "status">;
export const listClients = async () =>
  must(await supabase.from("clients").select("*").order("name")) as Client[];
export const getClient = async (id: string) =>
  must(await supabase.from("clients").select("*").eq("id", id).single()) as Client;
export const saveClient = async (id: string | null, input: ClientInput) =>
  id
    ? must(await supabase.from("clients").update(input).eq("id", id).select().single()) as Client
    : must(await supabase.from("clients").insert(input).select().single()) as Client;
export const deleteClient = async (id: string) => { must(await supabase.from("clients").delete().eq("id", id)); };

/* ---------- Projects ---------- */
export type ProjectInput = Pick<Project, "client_id" | "name" | "category" | "description" | "tech_stack" | "status"
  | "start_date" | "due_date" | "completed_on" | "live_url" | "internal_notes">;
export const listProjects = async () =>
  must(await supabase.from("projects").select("*, clients(id, name, business_name)").order("updated_at", { ascending: false })) as Project[];
export const getProject = async (id: string) =>
  must(await supabase.from("projects").select("*, clients(id, name, business_name)").eq("id", id).single()) as Project;
export const saveProject = async (id: string | null, input: ProjectInput) =>
  id
    ? must(await supabase.from("projects").update(input).eq("id", id).select().single()) as Project
    : must(await supabase.from("projects").insert(input).select().single()) as Project;
export const deleteProject = async (id: string) => { must(await supabase.from("projects").delete().eq("id", id)); };

/* ---------- Support periods ---------- */
export type SupportInput = Pick<SupportPeriod, "plan_name" | "starts_on" | "ends_on" | "terms">;
export const listSupport = async (projectId: string) =>
  must(await supabase.from("support_periods").select("*").eq("project_id", projectId).order("starts_on", { ascending: false })) as SupportPeriod[];
export const saveSupport = async (projectId: string, id: string | null, input: SupportInput) =>
  id
    ? must(await supabase.from("support_periods").update(input).eq("id", id).select().single()) as SupportPeriod
    : must(await supabase.from("support_periods").insert({ ...input, project_id: projectId }).select().single()) as SupportPeriod;
export const deleteSupport = async (id: string) => { must(await supabase.from("support_periods").delete().eq("id", id)); };

/* ---------- Deliveries ---------- */
const DELIVERY_SELECT = "*, projects(id, name, client_id, clients(name, business_name))";
export const listDeliveries = async () =>
  must(await supabase.from("deliveries").select(DELIVERY_SELECT).order("updated_at", { ascending: false })) as Delivery[];
export const getDelivery = async (id: string) =>
  must(await supabase.from("deliveries").select(DELIVERY_SELECT).eq("id", id).single()) as Delivery;

/**
 * A new delivery starts as a reviewed COPY of project facts. Internal fields (notes, budget,
 * requirements) are never copied; the description is copied into the summary for the owner to edit.
 */
export function prefillDelivery(project: Project, client: Pick<Client, "name" | "business_name"> | null, support: SupportPeriod | null): DeliveryContent & { project_id: string } {
  const live = project.live_url && project.live_url.startsWith("https://") ? project.live_url : null;
  return {
    project_id: project.id,
    theme: "midnight",
    client_display_name: (client?.name ?? "").split(/\s+/)[0] || client?.name || "there",
    business_display_name: client?.business_name ?? null,
    welcome_title: "Your new website is ready",
    welcome_message: null,
    project_title: project.name,
    project_summary: null,
    live_url: live,
    tech_list: project.tech_stack ?? [],
    completed_on: project.completed_on ?? new Date().toISOString().slice(0, 10),
    video_url: null,
    support_period_id: support?.id ?? null,
    support_contact_note: null,
    handover_checklist: [],
    closing_message: "It was a pleasure building this with you.",
  };
}

export const createDelivery = async (input: DeliveryContent & { project_id: string }) =>
  must(await supabase.from("deliveries").insert(input).select().single()) as Delivery;
export const updateDelivery = async (id: string, input: Partial<DeliveryContent>) =>
  must(await supabase.from("deliveries").update(input).eq("id", id).select(DELIVERY_SELECT).single()) as Delivery;
export const setDeliveryStatus = async (id: string, status: DeliveryStatus) =>
  must(await supabase.rpc("set_delivery_status", { p_delivery_id: id, p_status: status })) as DeliveryStatus;
export const deleteDelivery = async (id: string) => {
  const assets = await listAssets(id);
  if (assets.length) must(await supabase.storage.from(DELIVERY_BUCKET).remove(assets.map((a) => a.storage_path)));
  must(await supabase.from("deliveries").delete().eq("id", id));
};

/* ---------- Assets ---------- */
export const listAssets = async (deliveryId: string) =>
  must(await supabase.from("delivery_assets").select("*").eq("delivery_id", deliveryId)
    .order("kind").order("sort_order").order("created_at")) as DeliveryAsset[];

export async function uploadAsset(deliveryId: string, kind: "screenshot" | "document", file: File, sortOrder: number) {
  const path = storagePath(deliveryId, file.name);
  must(await supabase.storage.from(DELIVERY_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "3600" }));
  const title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "Untitled";
  const r = await supabase.from("delivery_assets").insert({
    delivery_id: deliveryId, kind, title: title.charAt(0).toUpperCase() + title.slice(1), storage_path: path,
    file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size, sort_order: sortOrder,
  }).select().single();
  if (r.error) {
    await supabase.storage.from(DELIVERY_BUCKET).remove([path]); // don't leave an orphan behind
    throw r.error;
  }
  return r.data as DeliveryAsset;
}
export const updateAsset = async (id: string, input: Partial<Pick<DeliveryAsset, "title" | "description" | "sort_order" | "is_published">>) =>
  must(await supabase.from("delivery_assets").update(input).eq("id", id).select().single()) as DeliveryAsset;
export async function deleteAsset(asset: DeliveryAsset) {
  must(await supabase.storage.from(DELIVERY_BUCKET).remove([asset.storage_path]));
  must(await supabase.from("delivery_assets").delete().eq("id", asset.id));
}
export async function assetPreviewUrl(path: string) {
  const r = await supabase.storage.from(DELIVERY_BUCKET).createSignedUrl(path, 300);
  return r.data?.signedUrl ?? null;
}

/* ---------- Links ---------- */
export const listTokens = async (deliveryId: string) =>
  must(await supabase.from("delivery_tokens")
    .select("id, delivery_id, kind, label, token_hint, expires_at, revoked_at, created_at, last_used_at, use_count")
    .eq("delivery_id", deliveryId).order("created_at", { ascending: false })) as DeliveryToken[];

/** Creates a link. Returns the plaintext token: show it once, it is not stored anywhere. */
export async function createLink(deliveryId: string, kind: "client" | "preview", label: string | null, expiresAt: string | null) {
  const t = await generateToken();
  must(await supabase.rpc("issue_delivery_token", {
    p_delivery_id: deliveryId, p_token_hash: t.hash, p_token_hint: t.hint, p_kind: kind, p_label: label, p_expires_at: expiresAt,
  }));
  return t.token;
}
export const revokeLink = async (tokenId: string) => { must(await supabase.rpc("revoke_delivery_token", { p_token_id: tokenId })); };

export const listEvents = async (deliveryId: string) =>
  must(await supabase.from("delivery_events").select("id, delivery_id, token_id, asset_id, event, user_agent, created_at")
    .eq("delivery_id", deliveryId).order("created_at", { ascending: false }).limit(50)) as DeliveryEvent[];

/* ---------- Business profile ---------- */
export const getProfile = async () =>
  must(await supabase.from("business_profile").select("*").eq("id", 1).single()) as BusinessProfile;
export const saveProfile = async (input: Omit<BusinessProfile, "id">) =>
  must(await supabase.from("business_profile").update(input).eq("id", 1).select().single()) as BusinessProfile;
