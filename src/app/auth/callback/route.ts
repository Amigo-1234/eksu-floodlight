import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "email_change", "magiclink"];

/**
 * Landing for links in auth emails (sign-up confirmation, password reset).
 * Supports both the PKCE `code` flow and `token_hash` email templates.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNext(params.get("next"));
  const supabase = await createSupabaseServerClient();

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : withFlag(next, "welcome"), request.url));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next === "/reset-password" ? next : withFlag(next, "welcome"), request.url));
    // A confirmation link opened in a different browser can't finish the PKCE
    // exchange, but the address IS confirmed by then — ask the user to sign in.
    const where = next === "/reset-password" ? "/forgot-password?error=link" : `/sign-in?error=confirm-elsewhere&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(new URL(where, request.url));
  }
  const errDesc = params.get("error_code") === "otp_expired" ? "expired" : "link";
  return NextResponse.redirect(new URL(`/sign-in?error=${errDesc}`, request.url));
}

function withFlag(path: string, flag: string) {
  return path + (path.includes("?") ? "&" : "?") + flag + "=1";
}
