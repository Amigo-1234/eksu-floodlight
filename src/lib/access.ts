import "server-only";
import { isBackendConfigured } from "./supabase/env";
import { createSupabaseServerClient } from "./supabase/server";

export type BookingAccess = { public_open: boolean; online_payments: boolean; can_book: boolean; test_mode: boolean };

/** Whether reservations are open, and whether the current visitor may book (server-checked again on insert). */
export async function getBookingAccess(): Promise<BookingAccess> {
  const closed = { public_open: false, online_payments: false, can_book: false, test_mode: true };
  if (!isBackendConfigured()) return closed;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.rpc("booking_access");
    return (data as BookingAccess) ?? closed;
  } catch {
    return closed;
  }
}
