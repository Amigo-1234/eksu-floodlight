// Domain types mirroring the Postgres schema (supabase/migrations).

export type BookingStatus =
  | "held" | "pending" | "confirmed" | "checked_in" | "completed" | "no_show" | "cancelled" | "rejected" | "expired";
export type ApprovalStatus = "not_required" | "pending" | "approved" | "rejected";
export type PaymentStatus =
  | "not_required" | "unconfigured" | "pending" | "paid" | "waived" | "failed" | "refunded" | "partially_refunded";
export type ActivityType = "friendly" | "training" | "practice" | "competition" | "other";
export type ActivityStatus = "scheduled" | "in_progress" | "completed" | "postponed" | "cancelled";
export type StaffRole = "facility_admin" | "scheduler" | "gatekeeper";
export type ApprovalMode = "required" | "automatic";
export type PaymentMode = "unconfigured" | "free" | "online" | "offline" | "hybrid" | "deposit";
export type AccessMode = "disabled" | "organizer_pass" | "participant_passes" | "organizer_and_participants";
export type CustomerCancellation = "pending_only" | "until_cutoff" | "not_allowed";
export type BlockKind = "maintenance" | "closure" | "official_use" | "event" | "other";
export type SlotState = "available" | "booked" | "requested" | "blocked" | "past" | "too_soon" | "too_far";

export type SportCategory = { id: string; slug: string; name: string; sort_order: number };

export type Facility = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location_label: string | null;
  sport_category_id: string;
  cover_image_path: string | null;
  rules: string | null;
  eligibility_note: string | null;
  entry_instructions: string | null;
  timezone: string;
  is_active: boolean;
  is_dev_fixture: boolean;
  show_on_public_schedule: boolean;
  sport_categories?: SportCategory | null;
};

export type Surface = {
  id: string; facility_id: string; name: string; description: string | null; is_active: boolean; sort_order: number;
};

export type OperatingHours = { id: string; facility_id: string; weekday: number; opens_at: string; closes_at: string };

export type BookingPolicy = {
  facility_id: string;
  slot_minutes: number | null;
  gap_minutes: number;
  min_notice_minutes: number | null;
  max_advance_days: number | null;
  max_active_bookings_per_user: number | null;
  approval_mode: ApprovalMode;
  payment_mode: PaymentMode;
  access_mode: AccessMode;
  entry_opens_minutes_before: number | null;
  entry_closes_minutes_after_start: number | null;
  customer_cancellation: CustomerCancellation;
  cancellation_cutoff_hours: number | null;
  customer_reschedule_allowed: boolean;
  reschedule_cutoff_hours: number | null;
};

export type FacilityPrice = {
  id: string; facility_id: string; label: string; amount_kobo: number; deposit_kobo: number | null;
  currency: string; is_default: boolean; is_active: boolean;
};

export type AvailabilitySlot = {
  surface_id: string; surface_name: string; slot_start: string; slot_end: string; state: SlotState;
};

export type Readiness = { bookable: boolean; missing: string[] };

export type Booking = {
  id: string;
  reference: string;
  facility_id: string;
  surface_id: string;
  period: string;
  status: BookingStatus;
  approval_status: ApprovalStatus;
  payment_status: PaymentStatus;
  source: "customer" | "staff" | "walk_in";
  customer_id: string | null;
  created_by: string;
  organizer_name: string;
  organizer_phone: string | null;
  organizer_email: string | null;
  activity_type: ActivityType;
  activity_title: string | null;
  team_name: string | null;
  opponent_name: string | null;
  purpose: string | null;
  notes: string | null;
  public_listing: boolean;
  amount_due_kobo: number | null;
  decision_reason: string | null;
  cancellation_reason: string | null;
  created_at: string;
  facilities?: Pick<Facility, "id" | "name" | "slug" | "timezone" | "location_label" | "is_dev_fixture" | "entry_instructions" | "rules"> | null;
  playing_surfaces?: Pick<Surface, "id" | "name"> | null;
  activities?: Activity | null;
};

export type Activity = {
  booking_id: string; status: ActivityStatus; started_at: string | null; ended_at: string | null;
  home_score: number | null; away_score: number | null; result_note: string | null;
};

export type Receipt = {
  id: string; booking_id: string; receipt_number: string; version: number; issued_at: string;
  snapshot: Record<string, unknown>;
};

export type Membership = { facility_id: string; role: StaffRole };
export type MyRoles = { user_id: string | null; is_platform_owner: boolean; mfa_ok: boolean; memberships: Membership[] };

export type GateResult =
  | "VALID" | "BOOKING_NOT_CONFIRMED" | "WRONG_FACILITY" | "OUTSIDE_ENTRY_WINDOW" | "BOOKING_CANCELLED"
  | "PASS_REVOKED" | "ALREADY_USED" | "UNKNOWN_CREDENTIAL" | "ACCESS_DISABLED";

export type GateBookingSummary = {
  booking_id: string; reference: string; facility: string; surface: string; starts_at: string; ends_at: string;
  organizer: string; team_name: string | null; opponent_name: string | null; activity_type: ActivityType;
  status: BookingStatus; payment_status: PaymentStatus; approval_status: ApprovalStatus; checked_in?: boolean;
};

export type GateScanResponse = {
  result: GateResult; mode: "test" | "live"; checked_in: boolean; checked_in_at: string | null;
  booking: GateBookingSummary | null;
};
