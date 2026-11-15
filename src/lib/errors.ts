// Maps coded database errors (raise exception 'CODE') to plain messages.

const MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "Please sign in to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  FORBIDDEN_WAIVE: "Only a facility administrator can waive payment.",
  NOT_FOUND: "We couldn't find that booking.",
  SURFACE_NOT_FOUND: "That playing area no longer exists.",
  FACILITY_NOT_BOOKABLE: "This facility isn't taking bookings right now.",
  POLICY_INCOMPLETE: "Bookings for this facility haven't been set up yet.",
  INVALID_SLOT: "That time isn't one of this facility's booking slots.",
  SLOT_IN_PAST: "That slot has already started.",
  NOTICE_TOO_SHORT: "That slot is too soon to book. Please choose a later time.",
  TOO_FAR_AHEAD: "That date is too far ahead to book.",
  SLOT_BLOCKED: "That time is closed (maintenance or official use).",
  SLOT_TAKEN: "Someone booked that slot a moment ago. Please pick another time.",
  ACTIVE_BOOKING_LIMIT: "You've reached the limit of active bookings at this facility.",
  PRICE_NOT_SET: "This facility's price hasn't been set yet, so it can't take bookings.",
  CONTACT_REQUIRED: "Add a phone number or an email so the facility can reach you.",
  NOT_AWAITING_APPROVAL: "This booking is no longer waiting for a decision.",
  REASON_REQUIRED: "Please give a reason.",
  INVALID_DECISION: "Unknown decision.",
  NOT_CANCELLABLE: "This booking can't be cancelled in its current state.",
  ALREADY_STARTED: "This booking has already started.",
  CANCELLATION_NOT_ALLOWED: "This facility doesn't allow cancelling confirmed bookings online. Please contact the facility.",
  CANCELLATION_CUTOFF_PASSED: "It's too close to the start time to cancel online.",
  NOT_RESCHEDULABLE: "This booking can't be moved in its current state.",
  RESCHEDULE_NOT_ALLOWED: "This facility doesn't allow moving bookings online. Please contact the facility.",
  RESCHEDULE_CUTOFF_PASSED: "It's too close to the start time to move this booking.",
  DIFFERENT_FACILITY: "A booking can only be moved within the same facility.",
  OFFLINE_PAYMENT_NOT_ENABLED: "Offline payments aren't enabled for this facility.",
  PAYMENT_NOT_DUE: "No payment is due for this booking.",
  INVALID_AMOUNT: "Enter a valid amount.",
  RECEIPT_NUMBER_REQUIRED: "Enter the payment receipt number.",
  ONLINE_PAYMENTS_DISABLED: "Online payment isn't available yet.",
  BOOKING_NOT_CONFIRMED: "This booking isn't confirmed.",
  INVALID_TRANSITION: "That change doesn't fit the activity's current status.",
  INVALID_EVENT: "Unknown activity event.",
  INVITATION_INVALID: "This invitation link is invalid, already used or expired.",
  INVITATION_EMAIL_MISMATCH: "This invitation was sent to a different email address. Sign in with that address.",
  INVALID_ROLE: "Unknown role.",
  FACILITY_REQUIRED: "Choose a facility for this role.",
  LAST_OWNER: "You can't remove the last platform owner.",
  INVALID_PERIOD: "The end must be after the start.",
  INVALID_RANGE: "Choose a range of up to 92 days.",
  IDEMPOTENCY_KEY_REQUIRED: "Request error. Please try again.",
};

export function errorCode(e: unknown): string | null {
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  const m = msg.match(/^([A-Z][A-Z_]+)\b/);
  return m ? m[1] : null;
}

export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const code = errorCode(e);
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback;
}
