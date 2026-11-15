/**
 * Public Supabase connection settings. Both values are safe in the browser:
 * every privilege is enforced in Postgres (RLS + checked functions).
 */
export type SupabaseEnv =
  | { ok: true; url: string; publishableKey: string }
  | { ok: false; error: string };

export function supabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return {
      ok: false,
      error: "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set (see .env.example).",
    };
  }
  try {
    new URL(url);
  } catch {
    return { ok: false, error: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL." };
  }
  return { ok: true, url, publishableKey };
}

/**
 * Floodlight's tables and functions live in their own Postgres schema so the
 * app can share a Supabase project with EKSU Sports Hub without touching its
 * objects. Every client below is pinned to this schema.
 */
export const DB_SCHEMA = "floodlight" as const;

export function isBackendConfigured(): boolean {
  return supabaseEnv().ok;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
