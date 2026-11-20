// Row shapes for the STB Core tables the app uses. Keep in step with stb-core/supabase/migrations.

export type Role = "owner" | "staff" | "viewer";

export interface Client {
  id: string;
  name: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = "planned" | "in_progress" | "on_hold" | "completed" | "cancelled";

export interface Project {
  id: string;
  client_id: string;
  name: string;
  category: string | null;
  description: string | null;
  tech_stack: string[];
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  completed_on: string | null;
  live_url: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  clients?: Pick<Client, "id" | "name" | "business_name"> | null;
}

export interface SupportPeriod {
  id: string;
  project_id: string;
  plan_name: string;
  starts_on: string;
  ends_on: string;
  terms: string | null;
}

export type DeliveryStatus = "draft" | "published" | "revoked";
export type Theme = "midnight" | "aurora" | "ivory";

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface Delivery {
  id: string;
  project_id: string;
  status: DeliveryStatus;
  theme: Theme;
  client_display_name: string;
  business_display_name: string | null;
  welcome_title: string | null;
  welcome_message: string | null;
  project_title: string;
  project_summary: string | null;
  live_url: string | null;
  tech_list: string[];
  completed_on: string | null;
  video_url: string | null;
  support_period_id: string | null;
  support_contact_note: string | null;
  handover_checklist: ChecklistItem[];
  closing_message: string | null;
  published_at: string | null;
  revoked_at: string | null;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  created_at: string;
  updated_at: string;
  projects?: Pick<Project, "id" | "name" | "client_id"> & { clients?: Pick<Client, "name" | "business_name"> | null } | null;
}

/** Fields the owner edits. Lifecycle columns are set only by database functions. */
export type DeliveryContent = Pick<Delivery,
  "theme" | "client_display_name" | "business_display_name" | "welcome_title" | "welcome_message" | "project_title"
  | "project_summary" | "live_url" | "tech_list" | "completed_on" | "video_url" | "support_period_id"
  | "support_contact_note" | "handover_checklist" | "closing_message">;

export interface DeliveryAsset {
  id: string;
  delivery_id: string;
  kind: "screenshot" | "document";
  title: string;
  description: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  is_published: boolean;
  created_at: string;
}

export interface DeliveryToken {
  id: string;
  delivery_id: string;
  kind: "client" | "preview";
  label: string | null;
  token_hint: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string | null;
  use_count: number;
}

export interface DeliveryEvent {
  id: number;
  delivery_id: string;
  token_id: string | null;
  asset_id: string | null;
  event: "opened" | "file_requested";
  user_agent: string | null;
  created_at: string;
}

export interface BusinessProfile {
  id: 1;
  brand_name: string;
  tagline: string | null;
  person_name: string | null;
  role_title: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  services: string[];
  socials: { label: string; url: string }[];
  support_hours: string | null;
}
