import "server-only";
import { supabaseEnv } from "./supabase/env";

export type SignupAvailability = "open" | "closed" | "unknown";

/**
 * Whether the shared Supabase Auth project currently accepts new email
 * sign-ups, read from GoTrue's public settings endpoint (publishable key only).
 * "Allow new users to sign up" is a project-wide switch shared with EKSU Sports
 * Hub, so Floodlight never assumes it is on: the sign-up page reflects the real
 * setting and turns itself on automatically once an owner enables it.
 */
export async function signupAvailability(): Promise<SignupAvailability> {
  const env = supabaseEnv();
  if (!env.ok) return "unknown";
  try {
    const res = await fetch(`${env.url}/auth/v1/settings`, {
      headers: { apikey: env.publishableKey },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return "unknown";
    const s = (await res.json()) as { disable_signup?: boolean; external?: { email?: boolean } };
    if (s.disable_signup === true || s.external?.email === false) return "closed";
    return "open";
  } catch {
    return "unknown";
  }
}
