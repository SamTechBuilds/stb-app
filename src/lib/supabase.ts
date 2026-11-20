import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

/** The only Supabase client in the app. It carries the signed-in owner's session; RLS does the rest. */
export const supabase: SupabaseClient = createClient(url ?? "http://localhost:54321", anonKey ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "stb-app-auth" },
});

export const DELIVERY_BUCKET = "delivery-files";
export const deliverySiteUrl = ((import.meta.env.VITE_DELIVERY_SITE_URL as string | undefined) ?? "").replace(/\/+$/, "");

/** Turn a Supabase/PostgREST error into a sentence the owner can act on. */
export function friendlyError(e: unknown): string {
  const err = e as { message?: string; code?: string } | null;
  const msg = err?.message ?? String(e);
  if (err?.code === "42501" || /not authorized|permission denied|row-level security/i.test(msg)) {
    return "Your account isn't allowed to do that. Sign in with the owner account.";
  }
  if (/use set_delivery_status/.test(msg)) return "Use the Publish, Unpublish or Revoke buttons to change status.";
  if (/support period belongs to a different project/.test(msg)) return "That support period belongs to a different project.";
  if (/violates check constraint/.test(msg) && /url/i.test(msg)) return "Links must start with https://";
  if (/violates check constraint/.test(msg)) return "One of the fields has a value that isn't allowed. Check lengths and formats.";
  if (/violates foreign key/.test(msg) && /restrict|still referenced/i.test(msg)) return "This record is still used elsewhere, so it can't be deleted.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Couldn't reach the server. Check your connection and try again.";
  return msg;
}

/** Throw on Supabase errors so TanStack Query surfaces them. */
export function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}
