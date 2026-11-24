import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, formatNaira, formatRange, isYmd, parseRange, todayInTz } from "../../src/lib/format.ts";
import { safeNext } from "../../src/lib/safe-next.ts";
import { activityLabel, bookingHeadline, PAYMENT_LABEL } from "../../src/lib/status.ts";

test("parseRange reads Postgres tstzrange output", () => {
  const r = parseRange('["2026-11-15 09:00:00+00","2026-11-15 10:00:00+00")');
  assert.equal(r.start, "2026-11-15T09:00:00.000Z");
  assert.equal(r.end, "2026-11-15T10:00:00.000Z");
});

test("times are shown in West Africa Time regardless of device timezone", () => {
  assert.equal(formatRange("2026-11-15T09:00:00Z", "2026-11-15T10:00:00Z"), "10:00 – 11:00");
});

test("date helpers", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.ok(isYmd("2026-02-28"));
  assert.ok(!isYmd("2026-2-28"));
  assert.match(todayInTz(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(formatNaira(500000), /5,000/);
  assert.equal(formatNaira(null), "—");
});

test("safeNext blocks open redirects", () => {
  assert.equal(safeNext("/dashboard/bookings"), "/dashboard/bookings");
  assert.equal(safeNext("//evil.example"), "/dashboard");
  assert.equal(safeNext("https://evil.example"), "/dashboard");
  assert.equal(safeNext("/\\evil.example"), "/dashboard");
  assert.equal(safeNext(undefined), "/dashboard");
});

test("status wording never implies payment or confirmation that did not happen", () => {
  assert.equal(bookingHeadline({ status: "pending", approval_status: "approved", payment_status: "unconfigured" }).label, "Awaiting confirmation");
  assert.equal(bookingHeadline({ status: "pending", approval_status: "pending", payment_status: "unconfigured" }).label, "Awaiting approval");
  assert.equal(bookingHeadline({ status: "pending", approval_status: "approved", payment_status: "pending" }).label, "Accepted · pay now");
  assert.equal(bookingHeadline({ status: "pending", approval_status: "approved", payment_status: "pending", proof_status: "submitted" }).label, "Receipt under review");
  assert.equal(bookingHeadline({ status: "pending", approval_status: "approved", payment_status: "pending", proof_status: "rejected" }).label, "Receipt not accepted");
  assert.notEqual(PAYMENT_LABEL.waived, "Paid");
  assert.notEqual(PAYMENT_LABEL.unconfigured, "Paid");
  assert.equal(activityLabel("scheduled"), null, "no LIVE label from the clock");
  assert.equal(activityLabel("in_progress")?.label, "LIVE");
});
