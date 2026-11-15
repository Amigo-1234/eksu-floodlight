import type {
  ActivityStatus, ActivityType, ApprovalStatus, Booking, BookingStatus, PaymentMode, PaymentStatus, SlotState,
} from "./types";

export type Tone = "ok" | "warn" | "danger" | "info" | "muted" | "signal";

/** One headline for a booking, derived from its separate status columns. */
export function bookingHeadline(b: Pick<Booking, "status" | "approval_status" | "payment_status">): { label: string; tone: Tone } {
  switch (b.status) {
    case "confirmed": return { label: "Confirmed", tone: "ok" };
    case "checked_in": return { label: "Checked in", tone: "ok" };
    case "completed": return { label: "Completed", tone: "muted" };
    case "no_show": return { label: "No-show", tone: "danger" };
    case "cancelled": return { label: "Cancelled", tone: "danger" };
    case "rejected": return { label: "Not approved", tone: "danger" };
    case "expired": return { label: "Expired", tone: "muted" };
    case "held": return { label: "Held", tone: "warn" };
    case "pending":
      if (b.approval_status === "pending") return { label: "Awaiting approval", tone: "warn" };
      if (b.payment_status === "pending" || b.payment_status === "failed") return { label: "Awaiting payment", tone: "warn" };
      if (b.payment_status === "unconfigured") return { label: "Awaiting confirmation", tone: "warn" };
      return { label: "Pending", tone: "warn" };
  }
}

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  held: "Held", pending: "Pending", confirmed: "Confirmed", checked_in: "Checked in", completed: "Completed",
  no_show: "No-show", cancelled: "Cancelled", rejected: "Not approved", expired: "Expired",
};

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  not_required: "Not required", pending: "Waiting for review", approved: "Approved", rejected: "Not approved",
};

/** Payment wording never implies money was received unless status is `paid`. */
export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  not_required: "No payment required",
  unconfigured: "Payment policy not yet set",
  pending: "Payment due",
  paid: "Paid",
  waived: "No charge (waived by staff)",
  failed: "Payment failed",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  unconfigured: "Not configured",
  free: "Free",
  online: "Online payment",
  offline: "Pay at the facility (recorded by staff)",
  hybrid: "Online or at the facility",
  deposit: "Deposit",
};

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  friendly: "Friendly match", training: "Training session", practice: "Team practice",
  competition: "Competition fixture", other: "Other activity",
};

/** Activity status as shown publicly: LIVE only after staff recorded a start. */
export function activityLabel(s: ActivityStatus | null | undefined): { label: string; tone: Tone } | null {
  switch (s) {
    case "in_progress": return { label: "LIVE", tone: "signal" };
    case "completed": return { label: "FULL TIME", tone: "muted" };
    case "postponed": return { label: "POSTPONED", tone: "warn" };
    case "cancelled": return { label: "CANCELLED", tone: "danger" };
    default: return null;
  }
}

export const SLOT_STATE: Record<SlotState, { label: string; bookable: boolean }> = {
  available: { label: "Free", bookable: true },
  booked: { label: "Booked", bookable: false },
  requested: { label: "Requested", bookable: false },
  blocked: { label: "Closed", bookable: false },
  past: { label: "Passed", bookable: false },
  too_soon: { label: "Too soon", bookable: false },
  too_far: { label: "Not open yet", bookable: false },
};

export const READINESS_LABEL: Record<string, string> = {
  facility_inactive: "Facility is not active",
  slot_duration_not_set: "Slot duration not set",
  opening_hours_not_set: "Opening hours not set",
  no_active_surface: "No active playing surface",
  price_not_set: "Price not set (a paid payment mode is selected)",
};
