"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

export async function acceptInvitation(token: string): Promise<{ ok: true; role: string } | { ok: false; error: string }> {
  if (typeof token !== "string" || token.length < 16 || token.length > 64) return { ok: false, error: "This invitation link is invalid." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_staff_invitation", { p_token: token });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, role: (data as { role: string }).role };
}
