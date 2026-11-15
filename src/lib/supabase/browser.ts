"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DB_SCHEMA, supabaseEnv } from "./env";

let client: SupabaseClient | null = null;

/** Browser Supabase client (session in cookies, shared with the server). */
export function supabaseBrowser(): SupabaseClient {
  if (client) return client;
  const env = supabaseEnv();
  if (!env.ok) throw new Error(env.error);
  client = createBrowserClient(env.url, env.publishableKey, { db: { schema: DB_SCHEMA } }) as unknown as SupabaseClient;
  return client;
}
