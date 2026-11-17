import "server-only";
import { supabaseEnv } from "./supabase/env";

export type SignupAvailability = "open" | "closed" | "unknown";
export type AuthSettings = { signup: SignupAvailability; emailConfirmation: boolean | null };

/**
 * The shared Supabase Auth project's live settings, read from GoTrue's public
 * settings endpoint (publishable key only), cached for 5 minutes.
 * "Allow new users to sign up" and "Confirm email" are project-wide switches
 * shared with EKSU Sports Hub, so Floodlight never assumes them: pages reflect
 * the real configuration and adapt by themselves when an owner changes it.
 */
export async function authSettings(): Promise<AuthSettings> {
  const env = supabaseEnv();
  if (!env.ok) return { signup: "unknown", emailConfirmation: null };
  try {
    const res = await fetch(`${env.url}/auth/v1/settings`, {
      headers: { apikey: env.publishableKey },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { signup: "unknown", emailConfirmation: null };
    const s = (await res.json()) as { disable_signup?: boolean; mailer_autoconfirm?: boolean; external?: { email?: boolean } };
    return {
      signup: s.disable_signup === true || s.external?.email === false ? "closed" : "open",
      emailConfirmation: typeof s.mailer_autoconfirm === "boolean" ? !s.mailer_autoconfirm : null,
    };
  } catch {
    return { signup: "unknown", emailConfirmation: null };
  }
}

/** True once a real email provider (custom SMTP) is configured — set EMAIL_DELIVERY_READY=true then. */
export function emailDeliveryReady(): boolean {
  return process.env.EMAIL_DELIVERY_READY === "true";
}
