import { NextResponse, type NextRequest } from "next/server";
import { paystackConfigured, verifyPaystackSignature, verifyTransaction } from "@/lib/paystack";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Paystack webhook. Order of checks:
 *   1. HMAC-SHA512 signature over the raw body (rejects forged calls).
 *   2. Re-verify the transaction with Paystack's Verify API.
 *   3. apply_verified_payment (service role) — idempotent on the event id,
 *      and rejects amount/currency mismatches against the server's own record.
 * Disabled (503) until PAYSTACK_SECRET_KEY and SUPABASE_SECRET_KEY are set.
 */
export async function POST(request: NextRequest) {
  if (!paystackConfigured()) return NextResponse.json({ error: "online payments not configured" }, { status: 503 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "server not configured" }, { status: 503 });

  const raw = await request.text();
  if (!verifyPaystackSignature(raw, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let event: { event?: string; data?: { id?: number | string; reference?: string } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad body" }, { status: 400 }); }
  const reference = event.data?.reference;
  if (!reference || !event.event?.startsWith("charge.")) return NextResponse.json({ ignored: true });

  const verified = await verifyTransaction(reference);
  if (!verified) return NextResponse.json({ error: "verification unavailable" }, { status: 502 }); // Paystack retries

  const { data, error } = await service.rpc("apply_verified_payment", {
    p_provider: "paystack",
    p_event_id: `${event.event}:${event.data?.id ?? reference}`,
    p_reference: verified.reference,
    p_amount_kobo: verified.amount,
    p_currency: verified.currency,
    p_success: verified.status === "success",
    p_payload: { event: event.event, verify_status: verified.status },
  });
  if (error) return NextResponse.json({ error: "apply failed" }, { status: 500 });
  return NextResponse.json({ result: data });
}
