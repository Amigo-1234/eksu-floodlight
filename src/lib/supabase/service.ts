import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Service-role client. Used ONLY by the payment webhook to call
 * apply_verified_payment after the provider signature and transaction have
 * been verified server-side. Never import this from a page or component.
 */
export function createServiceClient() {
  const env = supabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!env.ok || !secret) return null;
  return createClient(env.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
