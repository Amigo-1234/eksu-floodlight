import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack integration helpers. Nothing here runs unless PAYSTACK_SECRET_KEY
 * is configured AND an owner has enabled online payments AND a facility uses
 * an online-capable payment mode. A browser redirect never confirms payment:
 * only a signed webhook that is re-verified with the Verify API does.
 */
export function paystackConfigured(): boolean {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type VerifiedTransaction = { reference: string; status: string; amount: number; currency: string };

/** Server-to-server re-verification of a transaction (never trust the webhook body alone). */
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction | null> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return null;
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { status: boolean; data?: VerifiedTransaction };
  return json.status && json.data ? json.data : null;
}

export async function initializeTransaction(input: { email: string; amountKobo: number; reference: string; callbackUrl: string }) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return null;
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, amount: input.amountKobo, reference: input.reference, currency: "NGN", callback_url: input.callbackUrl }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { status: boolean; data?: { authorization_url: string } };
  return json.status ? json.data?.authorization_url ?? null : null;
}
