import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

let client: SupabaseClient | null = null;

/** Managed backend client. Absent until Supabase URL and anon key are configured. */
export function getSupabase(): SupabaseClient | null {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  client ??= createClient(config.supabaseUrl, config.supabaseAnonKey);
  return client;
}

export function usesManagedBackend(): boolean {
  return config.dataSource === "supabase" && getSupabase() !== null;
}
