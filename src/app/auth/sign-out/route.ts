import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isBackendConfigured } from "@/lib/supabase/env";

/** POST only, so a link or image elsewhere cannot sign people out. */
export async function POST(request: NextRequest) {
  if (isBackendConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
