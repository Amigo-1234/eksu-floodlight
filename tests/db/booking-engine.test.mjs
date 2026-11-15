import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createTestDatabase, createUser, createFacility, grantRole, makeOwner, rpc, asUser, slotStart, currentSlotStart,
} from "./harness.mjs";

let db;
before(async () => { db = await createTestDatabase(); });
after(async () => { await db?.drop(); });

const book = (pool, user, surface, start, extra = {}) => rpc(pool, user,
  `select public.create_booking(p_surface_id => $1, p_start => $2, p_organizer_name => $3,
     p_organizer_email => $4, p_team_name => $5, p_idempotency_key => $6)`,
  [surface, start, extra.name ?? "Ada Organizer", extra.email ?? "ada@example.test", extra.team ?? "Team One", extra.key ?? null]);

const err = (r) => (r.ok ? "OK" : (r.message.match(/^[A-Z_]+/)?.[0] ?? r.message));

// ---------------------------------------------------------------------------
test("customer request with default policy stays pending: approval required, payment unconfigured", async () => {
  const f = await createFacility(db.pool);
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const r = await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 30));
  assert.ok(r.ok, r.message);
  assert.equal(r.value.status, "pending");
  assert.equal(r.value.approval_status, "pending");
  assert.equal(r.value.payment_status, "unconfigured");
  const receipts = await db.pool.query("select count(*)::int n from public.receipts where booking_id = $1", [r.value.id]);
  assert.equal(receipts.rows[0].n, 0, "no receipt before confirmation");
});

test("free + automatic facility confirms immediately and issues a receipt (no pass while access is disabled)", async () => {
  const f = await createFacility(db.pool, { policy: { approval_mode: "automatic", payment_mode: "free" } });
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const r = await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 30));
  assert.ok(r.ok, r.message);
  assert.equal(r.value.status, "confirmed");
  const n = await db.pool.query(
    `select (select count(*) from public.receipts where booking_id = $1)::int receipts,
            (select count(*) from public.access_credentials where booking_id = $1)::int creds`, [r.value.id]);
  assert.deepEqual(n.rows[0], { receipts: 1, creds: 0 });
});

test("40 simultaneous requests for one slot: exactly one succeeds, the rest get SLOT_TAKEN", async () => {
  const f = await createFacility(db.pool, { policy: { approval_mode: "automatic", payment_mode: "free" } });
  const start = await slotStart(db.pool, 40);
  const users = await Promise.all(Array.from({ length: 40 }, (_, i) => createUser(db.pool, `c${i}-${randomUUID()}@example.test`)));
  const results = await Promise.all(users.map((u) => book(db.pool, u, f.surfaces[0], start)));
  const ok = results.filter((r) => r.ok);
  const taken = results.filter((r) => !r.ok && err(r) === "SLOT_TAKEN");
  assert.equal(ok.length, 1, `successes: ${ok.length}; errors: ${results.filter((r) => !r.ok).map(err).join(",")}`);
  assert.equal(taken.length, 39);
  const rows = await db.pool.query(
    "select count(*)::int n from public.bookings where surface_id = $1 and lower(period) = $2", [f.surfaces[0], start]);
  assert.equal(rows.rows[0].n, 1);
});

test("same slot on a different surface of the same facility is allowed", async () => {
  const f = await createFacility(db.pool, { surfaces: ["Court 1", "Court 2"] });
  const start = await slotStart(db.pool, 31);
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  assert.ok((await book(db.pool, u, f.surfaces[0], start)).ok);
  assert.ok((await book(db.pool, u, f.surfaces[1], start)).ok);
});

test("staff and walk-in bookings respect existing reservations", async () => {
  const f = await createFacility(db.pool);
  const admin = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  const sched = await createUser(db.pool, `s-${randomUUID()}@example.test`);
  await grantRole(db.pool, admin, f.id, "facility_admin");
  await grantRole(db.pool, sched, f.id, "scheduler");
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const start = await slotStart(db.pool, 32);
  assert.ok((await book(db.pool, u, f.surfaces[0], start)).ok);
  for (const [who, source] of [[admin, "staff"], [sched, "walk_in"]]) {
    const r = await rpc(db.pool, who,
      `select public.staff_create_booking(p_surface_id => $1, p_start => $2, p_source => $3, p_organizer_name => 'Walk In')`,
      [f.surfaces[0], start, source]);
    assert.equal(err(r), "SLOT_TAKEN");
  }
});

test("slot rules: misaligned, past, blocked, too far ahead, too soon", async () => {
  const f = await createFacility(db.pool, { policy: { max_advance_days: 7, min_notice_minutes: 180 } });
  const admin = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  await grantRole(db.pool, admin, f.id, "facility_admin");
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const s = f.surfaces[0];
  const aligned = await slotStart(db.pool, 30);
  const misaligned = new Date(new Date(aligned).getTime() + 15 * 60000);
  assert.equal(err(await book(db.pool, u, s, misaligned)), "INVALID_SLOT");
  assert.equal(err(await book(db.pool, u, s, await slotStart(db.pool, -5))), "SLOT_IN_PAST");
  assert.equal(err(await book(db.pool, u, s, await slotStart(db.pool, 24 * 9))), "TOO_FAR_AHEAD");
  assert.equal(err(await book(db.pool, u, s, await slotStart(db.pool, 1))), "NOTICE_TOO_SHORT");

  const blockStart = await slotStart(db.pool, 50);
  const blockEnd = await slotStart(db.pool, 52);
  const b = await rpc(db.pool, admin,
    `select public.create_facility_block($1, null, $2, $3, 'maintenance', 'Pitch care')`, [f.id, blockStart, blockEnd]);
  assert.ok(b.ok && b.value.created, JSON.stringify(b));
  assert.equal(err(await book(db.pool, u, s, await slotStart(db.pool, 51))), "SLOT_BLOCKED");
});

test("a block cannot be placed over an active booking; conflicts are returned", async () => {
  const f = await createFacility(db.pool);
  const admin = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  await grantRole(db.pool, admin, f.id, "facility_admin");
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const start = await slotStart(db.pool, 33);
  const bk = await book(db.pool, u, f.surfaces[0], start);
  const r = await rpc(db.pool, admin,
    `select public.create_facility_block($1, null, $2::timestamptz, $2::timestamptz + interval '3 hours', 'closure', null)`,
    [f.id, start]);
  assert.ok(r.ok);
  assert.equal(r.value.created, false);
  assert.equal(r.value.conflicts[0].reference, bk.value.reference);
});

test("approval does not confirm while payment is unconfigured unless an admin explicitly waives it", async () => {
  const f = await createFacility(db.pool);
  const admin = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  await grantRole(db.pool, admin, f.id, "facility_admin");
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const b1 = (await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 34))).value;
  const r1 = await rpc(db.pool, admin, "select public.review_booking($1, 'approve')", [b1.id]);
  assert.equal(r1.value.status, "pending");
  const b2 = (await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 35))).value;
  const r2 = await rpc(db.pool, admin, "select public.review_booking($1, 'approve', null, true)", [b2.id]);
  assert.equal(r2.value.status, "confirmed");
  const row = (await db.pool.query("select payment_status from public.bookings where id = $1", [b2.id])).rows[0];
  assert.equal(row.payment_status, "waived");
  const audit = await db.pool.query("select count(*)::int n from public.audit_log where entity_id = $1 and action = 'booking.approved'", [b2.id]);
  assert.equal(audit.rows[0].n, 1);
});

test("schedulers and customers cannot approve; rejection needs a reason", async () => {
  const f = await createFacility(db.pool);
  const sched = await createUser(db.pool, `s-${randomUUID()}@example.test`);
  const admin = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  await grantRole(db.pool, sched, f.id, "scheduler");
  await grantRole(db.pool, admin, f.id, "facility_admin");
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const b = (await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 36))).value;
  assert.equal(err(await rpc(db.pool, sched, "select public.review_booking($1, 'approve')", [b.id])), "FORBIDDEN");
  assert.equal(err(await rpc(db.pool, u, "select public.review_booking($1, 'approve')", [b.id])), "FORBIDDEN");
  assert.equal(err(await rpc(db.pool, admin, "select public.review_booking($1, 'reject')", [b.id])), "REASON_REQUIRED");
  const r = await rpc(db.pool, admin, "select public.review_booking($1, 'reject', 'Field reserved for exams')", [b.id]);
  assert.equal(r.value.status, "rejected");
  // The slot is free again.
  assert.ok((await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 36))).ok);
});

test("row level security: customers see only their own bookings; anon sees none; direct writes are refused", async () => {
  const f = await createFacility(db.pool);
  const a = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  const b = await createUser(db.pool, `b-${randomUUID()}@example.test`);
  const bk = (await book(db.pool, a, f.surfaces[0], await slotStart(db.pool, 37))).value;
  const seenByB = await asUser(db.pool, b, (c) => c.query("select id from public.bookings where id = $1", [bk.id]));
  assert.equal(seenByB.rowCount, 0);
  const seenByA = await asUser(db.pool, a, (c) => c.query("select id from public.bookings where id = $1", [bk.id]));
  assert.equal(seenByA.rowCount, 1);
  const anon = await rpc(db.pool, null, "select count(*) from public.bookings");
  assert.equal(anon.ok, false);
  const upd = await rpc(db.pool, a, "update public.bookings set status = 'confirmed' where id = $1", [bk.id]);
  assert.equal(upd.ok, false, "customers cannot update bookings directly");
  const cancelByB = await rpc(db.pool, b, "select public.cancel_booking($1)", [bk.id]);
  assert.equal(err(cancelByB), "NOT_FOUND");
  const receiptByB = await asUser(db.pool, b, (c) => c.query("select * from public.receipts where booking_id = $1", [bk.id]));
  assert.equal(receiptByB.rowCount, 0);
});

test("staff of one facility cannot act on another facility", async () => {
  const f1 = await createFacility(db.pool);
  const f2 = await createFacility(db.pool);
  const admin1 = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  await grantRole(db.pool, admin1, f1.id, "facility_admin");
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const bk = (await book(db.pool, u, f2.surfaces[0], await slotStart(db.pool, 38))).value;
  assert.equal(err(await rpc(db.pool, admin1, "select public.review_booking($1, 'approve')", [bk.id])), "FORBIDDEN");
  const seen = await asUser(db.pool, admin1, (c) => c.query("select id from public.bookings where id = $1", [bk.id]));
  assert.equal(seen.rowCount, 0);
  const upd = await asUser(db.pool, admin1, (c) =>
    c.query("update public.booking_policies set slot_minutes = 30 where facility_id = $1", [f2.id]));
  assert.equal(upd.rowCount, 0, "policy of another facility is not updatable");
});

test("customer cancellation follows policy: pending can be withdrawn, confirmed cannot by default", async () => {
  const f = await createFacility(db.pool, { policy: { approval_mode: "automatic", payment_mode: "free" } });
  const g = await createFacility(db.pool);
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const confirmed = (await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 39))).value;
  assert.equal(err(await rpc(db.pool, u, "select public.cancel_booking($1)", [confirmed.id])), "CANCELLATION_NOT_ALLOWED");
  const pending = (await book(db.pool, u, g.surfaces[0], await slotStart(db.pool, 39))).value;
  const r = await rpc(db.pool, u, "select public.cancel_booking($1, 'Plans changed')", [pending.id]);
  assert.equal(r.value.status, "cancelled");
});

test("idempotent create: retrying with the same key returns the same booking", async () => {
  const f = await createFacility(db.pool);
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const start = await slotStart(db.pool, 41);
  const r1 = await book(db.pool, u, f.surfaces[0], start, { key: "retry-key-1" });
  const r2 = await book(db.pool, u, f.surfaces[0], start, { key: "retry-key-1" });
  assert.equal(r1.value.id, r2.value.id);
});

test("reschedule keeps the reference and cannot land on a taken slot", async () => {
  const f = await createFacility(db.pool);
  const admin = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  await grantRole(db.pool, admin, f.id, "facility_admin");
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const a = (await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 42))).value;
  const b = (await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 43))).value;
  assert.equal(err(await rpc(db.pool, u, "select public.reschedule_booking($1, $2, $3)", [a.id, f.surfaces[0], await slotStart(db.pool, 44)])),
    "RESCHEDULE_NOT_ALLOWED");
  assert.equal(err(await rpc(db.pool, admin, "select public.reschedule_booking($1, $2, $3)", [a.id, f.surfaces[0], await slotStart(db.pool, 43)])),
    "SLOT_TAKEN");
  const ok = await rpc(db.pool, admin, "select public.reschedule_booking($1, $2, $3)", [a.id, f.surfaces[0], await slotStart(db.pool, 45)]);
  assert.ok(ok.ok, ok.message);
  const row = (await db.pool.query("select reference, lower(period) s from public.bookings where id = $1", [a.id])).rows[0];
  assert.equal(row.reference, a.reference);
  assert.equal(new Date(row.s).getTime(), new Date(await slotStart(db.pool, 45)).getTime());
  assert.ok(b.id);
});

// ---------------------------------------------------------------------------
// Gate verification
// ---------------------------------------------------------------------------
async function gateSetup() {
  const f = await createFacility(db.pool, {
    policy: { approval_mode: "automatic", payment_mode: "free", access_mode: "organizer_pass" },
  });
  const other = await createFacility(db.pool);
  const admin = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  const gk = await createUser(db.pool, `g-${randomUUID()}@example.test`);
  const gkOther = await createUser(db.pool, `h-${randomUUID()}@example.test`);
  await grantRole(db.pool, admin, f.id, "facility_admin");
  await grantRole(db.pool, gk, f.id, "gatekeeper");
  await grantRole(db.pool, gkOther, other.id, "gatekeeper");
  const customer = await createUser(db.pool, `c-${randomUUID()}@example.test`);
  // A booking for the slot under way right now, made by staff on the customer's account.
  const custEmail = (await db.pool.query("select email from auth.users where id = $1", [customer])).rows[0].email;
  const r = await rpc(db.pool, admin,
    `select public.staff_create_booking(p_surface_id => $1, p_start => $2, p_source => 'walk_in',
       p_organizer_name => 'Gate Test', p_customer_email => $3)`, [f.surfaces[0], await currentSlotStart(db.pool), custEmail]);
  assert.ok(r.ok, r.message);
  assert.equal(r.value.status, "confirmed");
  const tok = await rpc(db.pool, customer, "select public.my_pass_token($1)", [r.value.id]);
  assert.ok(tok.ok && tok.value.available, JSON.stringify(tok));
  return { f, other, admin, gk, gkOther, customer, booking: r.value, token: tok.value.token };
}

const scan = (pool, user, facility, token, commit, key) =>
  rpc(pool, user, "select public.gate_scan($1, $2, $3, $4, 'test-phone')", [facility, token, commit, key]);

test("gate: valid pass checks in once (test mode); repeat scan is ALREADY_USED; same-key retry replays", async () => {
  const s = await gateSetup();
  const verifyOnly = await scan(db.pool, s.gk, s.f.id, s.token, false, "key-verify-1");
  assert.equal(verifyOnly.value.result, "VALID");
  assert.equal(verifyOnly.value.checked_in, false);
  const first = await scan(db.pool, s.gk, s.f.id, s.token, true, "key-commit-1");
  assert.equal(first.value.result, "VALID");
  assert.equal(first.value.mode, "test");
  assert.equal(first.value.checked_in, true);
  const again = await scan(db.pool, s.gk, s.f.id, s.token, true, "key-commit-2");
  assert.equal(again.value.result, "ALREADY_USED");
  const retry = await scan(db.pool, s.gk, s.f.id, s.token, true, "key-commit-1");
  assert.equal(retry.value.result, "VALID");
  assert.equal(retry.value.checked_in, true);
  const st = (await db.pool.query("select status from public.bookings where id = $1", [s.booking.id])).rows[0].status;
  assert.equal(st, "confirmed", "test mode never marks the booking as checked in");
  const logs = await db.pool.query("select count(*)::int n from public.access_verification_logs where booking_id = $1", [s.booking.id]);
  assert.equal(logs.rows[0].n, 4, "every attempt is logged");
  assert.equal(verifyOnly.value.booking.organizer, "Gate");
  assert.equal(verifyOnly.value.booking.organizer_phone, undefined);
});

test("gate: 12 phones scanning the same pass at once admit exactly one", async () => {
  const s = await gateSetup();
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    scan(db.pool, s.gk, s.f.id, s.token, true, `concurrent-key-${i}`)));
  const admitted = results.filter((r) => r.ok && r.value.checked_in);
  const used = results.filter((r) => r.ok && r.value.result === "ALREADY_USED");
  assert.equal(admitted.length, 1, JSON.stringify(results.map((r) => r.value?.result ?? r.message)));
  assert.equal(used.length, 11);
});

test("gate: forged, tampered and revoked passes are refused; wrong facility and wrong staff are refused", async () => {
  const s = await gateSetup();
  const [p, id, v, sig] = s.token.split(".");
  const tampered = `${p}.${id}.${Number(v) + 1}.${sig}`;
  const forged = `${p}.${randomUUID()}.1.${sig}`;
  assert.equal((await scan(db.pool, s.gk, s.f.id, tampered, false, "k-tamper-01")).value.result, "UNKNOWN_CREDENTIAL");
  assert.equal((await scan(db.pool, s.gk, s.f.id, forged, false, "k-forged-01")).value.result, "UNKNOWN_CREDENTIAL");
  assert.equal((await scan(db.pool, s.gk, s.f.id, "FL-ABCD-EFGH", false, "k-ref-0001")).value.result, "UNKNOWN_CREDENTIAL",
    "a booking reference is not a pass");
  // A gatekeeper of another facility cannot scan here at all.
  assert.equal(err(await scan(db.pool, s.gkOther, s.f.id, s.token, false, "k-other-01")), "FORBIDDEN");
  // Customers cannot use the gate.
  assert.equal(err(await scan(db.pool, s.customer, s.f.id, s.token, false, "k-cust-001")), "FORBIDDEN");
  // Cancelling revokes the pass.
  const c = await rpc(db.pool, s.admin, "select public.cancel_booking($1, 'Storm warning')", [s.booking.id]);
  assert.ok(c.ok, c.message);
  assert.equal((await scan(db.pool, s.gk, s.f.id, s.token, true, "k-revoked-1")).value.result, "PASS_REVOKED");
});

test("gate: wrong facility is reported when a gatekeeper works both gates", async () => {
  const s = await gateSetup();
  await grantRole(db.pool, s.gk, s.other.id, "gatekeeper");
  const r = await scan(db.pool, s.gk, s.other.id, s.token, true, "k-wrongfac");
  assert.equal(r.value.result, "WRONG_FACILITY");
  assert.equal(r.value.checked_in, false);
  assert.equal(r.value.booking, null, "no booking details leak to another facility's gate");
});

test("gate: manual check-in follows the same rules and requires a reason", async () => {
  const s = await gateSetup();
  assert.equal(err(await rpc(db.pool, s.gk, "select public.gate_manual_check_in($1, $2, '', 'manual-key-1')", [s.f.id, s.booking.id])),
    "REASON_REQUIRED");
  const lookup = await rpc(db.pool, s.gk, "select public.gate_lookup($1, $2)", [s.f.id, s.booking.reference]);
  assert.equal(lookup.value.found, true);
  const m = await rpc(db.pool, s.gk, "select public.gate_manual_check_in($1, $2, 'Phone battery dead', 'manual-key-2')",
    [s.f.id, s.booking.id]);
  assert.equal(m.value.result, "VALID");
  assert.equal(m.value.checked_in, true);
  const again = await scan(db.pool, s.gk, s.f.id, s.token, true, "after-manual");
  assert.equal(again.value.result, "ALREADY_USED");
});

test("gate: live admission marks the booking checked in (only when the owner turns it on)", async () => {
  const s = await gateSetup();
  const owner = await createUser(db.pool, `o-${randomUUID()}@example.test`);
  await makeOwner(db.pool, owner);
  const denied = await rpc(db.pool, s.admin, "update public.platform_settings set live_gate_admission = true where id = 1 returning live_gate_admission");
  assert.equal(denied.rows?.length ?? 0, 0, "facility admins cannot switch on live admission");
  const on = await rpc(db.pool, owner, "update public.platform_settings set live_gate_admission = true where id = 1 returning live_gate_admission");
  assert.equal(on.value, true);
  const r = await scan(db.pool, s.gk, s.f.id, s.token, true, "live-key-001");
  assert.equal(r.value.mode, "live");
  const st = (await db.pool.query("select status from public.bookings where id = $1", [s.booking.id])).rows[0].status;
  assert.equal(st, "checked_in");
  await db.pool.query("update public.platform_settings set live_gate_admission = false where id = 1");
});

test("unconfirmed bookings are never admitted", async () => {
  const f = await createFacility(db.pool, { policy: { access_mode: "organizer_pass" } });
  const gk = await createUser(db.pool, `g-${randomUUID()}@example.test`);
  await grantRole(db.pool, gk, f.id, "gatekeeper");
  const sched = await createUser(db.pool, `s-${randomUUID()}@example.test`);
  await grantRole(db.pool, sched, f.id, "scheduler");
  // Staff booking with payment unconfigured stays pending → no pass → manual check-in refused.
  const r = await rpc(db.pool, sched,
    `select public.staff_create_booking(p_surface_id => $1, p_start => $2, p_source => 'walk_in', p_organizer_name => 'Pending Team')`,
    [f.surfaces[0], await currentSlotStart(db.pool)]);
  assert.equal(r.value.status, "pending");
  const m = await rpc(db.pool, gk, "select public.gate_manual_check_in($1, $2, 'No QR', 'pending-key-1')", [f.id, r.value.id]);
  assert.equal(m.value.result, "BOOKING_NOT_CONFIRMED");
  assert.equal(m.value.checked_in, false);
  assert.equal(err(await rpc(db.pool, sched,
    `select public.staff_create_booking(p_surface_id => $1, p_start => $2, p_source => 'staff', p_organizer_name => 'X', p_waive_payment => true)`,
    [f.surfaces[0], await slotStart(db.pool, 46)])), "FORBIDDEN_WAIVE", "schedulers cannot waive payment");
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
test("payments: verified webhook confirms once; duplicates and amount mismatches are rejected; clients cannot apply payments", async () => {
  const f = await createFacility(db.pool, { policy: { approval_mode: "automatic", payment_mode: "online" } });
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  assert.equal(err(await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 47))), "PRICE_NOT_SET");
  await db.pool.query("insert into public.facility_prices (facility_id, label, amount_kobo, is_default) values ($1, 'Test price', 500000, true)", [f.id]);
  const b = (await book(db.pool, u, f.surfaces[0], await slotStart(db.pool, 47))).value;
  assert.equal(b.status, "pending");
  assert.equal(b.payment_status, "pending");
  assert.equal(err(await rpc(db.pool, u, "select public.start_online_payment($1)", [b.id])), "ONLINE_PAYMENTS_DISABLED");
  await db.pool.query("update public.platform_settings set online_payments_enabled = true where id = 1");
  const start = await rpc(db.pool, u, "select public.start_online_payment($1)", [b.id]);
  assert.ok(start.ok, start.message);
  const ref = start.value.reference;

  const direct = await rpc(db.pool, u, "select public.apply_verified_payment('paystack','evt-x',$1,500000,'NGN',true,'{}')", [ref]);
  assert.equal(direct.ok, false, "authenticated users cannot call apply_verified_payment");

  const svc = async (sql, params) => {
    const c = await db.pool.connect();
    try { await c.query("set role service_role"); return (await c.query(sql, params)).rows[0]; }
    finally { await c.query("reset role"); c.release(); }
  };
  const mismatch = await svc("select public.apply_verified_payment('paystack','evt-1',$1,100,'NGN',true,'{}') r", [ref]);
  assert.equal(mismatch.r, "amount_mismatch");
  const start2 = await rpc(db.pool, u, "select public.start_online_payment($1)", [b.id]);
  const ok = await svc("select public.apply_verified_payment('paystack','evt-2',$1,500000,'NGN',true,'{}') r", [start2.value.reference]);
  assert.equal(ok.r, "applied");
  const dup = await svc("select public.apply_verified_payment('paystack','evt-2',$1,500000,'NGN',true,'{}') r", [start2.value.reference]);
  assert.equal(dup.r, "duplicate");
  const row = (await db.pool.query("select status, payment_status from public.bookings where id = $1", [b.id])).rows[0];
  assert.deepEqual(row, { status: "confirmed", payment_status: "paid" });
  await db.pool.query("update public.platform_settings set online_payments_enabled = false where id = 1");
});

// ---------------------------------------------------------------------------
// Staff provisioning and audit
// ---------------------------------------------------------------------------
test("staff invitations: scoped by role, bound to email, single use", async () => {
  const f = await createFacility(db.pool);
  const admin = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  await grantRole(db.pool, admin, f.id, "facility_admin");
  assert.equal(err(await rpc(db.pool, admin, "select public.invite_staff('x@example.test', 'facility_admin', $1)", [f.id])), "FORBIDDEN");
  assert.equal(err(await rpc(db.pool, admin, "select public.invite_staff('x@example.test', 'platform_owner')")), "FORBIDDEN");
  const email = `gk-${randomUUID()}@example.test`;
  const inv = await rpc(db.pool, admin, "select public.invite_staff($1, 'gatekeeper', $2)", [email, f.id]);
  assert.ok(inv.ok, inv.message);
  const stranger = await createUser(db.pool, `z-${randomUUID()}@example.test`);
  assert.equal(err(await rpc(db.pool, stranger, "select public.accept_staff_invitation($1)", [inv.value.token])), "INVITATION_EMAIL_MISMATCH");
  const invitee = await createUser(db.pool, email);
  const acc = await rpc(db.pool, invitee, "select public.accept_staff_invitation($1)", [inv.value.token]);
  assert.equal(acc.value.role, "gatekeeper");
  assert.equal(err(await rpc(db.pool, invitee, "select public.accept_staff_invitation($1)", [inv.value.token])), "INVITATION_INVALID");
  const roles = await rpc(db.pool, invitee, "select public.my_roles()");
  assert.equal(roles.value.memberships[0].role, "gatekeeper");
  const self = await rpc(db.pool, invitee, "insert into public.staff_memberships (user_id, facility_id, role) values ($1, $2, 'facility_admin')",
    [invitee, f.id]);
  assert.equal(self.ok, false, "no self-granted roles");
});

test("MFA requirement: when switched on, staff without an aal2 session lose staff powers", async () => {
  const f = await createFacility(db.pool);
  const admin = await createUser(db.pool, `a-${randomUUID()}@example.test`);
  await grantRole(db.pool, admin, f.id, "facility_admin");
  await db.pool.query("update public.platform_settings set require_staff_mfa = true where id = 1");
  try {
    const aal1 = await rpc(db.pool, admin, "select public.admin_overview($1)", [f.id]);
    assert.equal(err(aal1), "FORBIDDEN");
    const aal2 = await asUser(db.pool, admin, (c) => c.query("select public.admin_overview($1) v", [f.id]), { aal: "aal2" });
    assert.ok(aal2.rows[0].v);
  } finally {
    await db.pool.query("update public.platform_settings set require_staff_mfa = false where id = 1");
  }
});

test("audit log and verification logs are append-only", async () => {
  await db.pool.query("select private.audit('test.event', 'test', 'x', null, '{}')");
  await assert.rejects(db.pool.query("update public.audit_log set action = 'tampered'"), /APPEND_ONLY/);
  await assert.rejects(db.pool.query("delete from public.audit_log"), /APPEND_ONLY/);
});

test("availability reports real states and leaks no personal data", async () => {
  const f = await createFacility(db.pool, { policy: { approval_mode: "automatic", payment_mode: "free" } });
  const u = await createUser(db.pool, `u-${randomUUID()}@example.test`);
  const start = await slotStart(db.pool, 30);
  await book(db.pool, u, f.surfaces[0], start);
  const day = (await db.pool.query("select ($1::timestamptz at time zone 'Africa/Lagos')::date d", [start])).rows[0].d;
  const r = await asUser(db.pool, null, (c) => c.query("select * from public.facility_availability($1, $2)", [f.id, day]));
  const slot = r.rows.find((x) => new Date(x.slot_start).getTime() === new Date(start).getTime());
  assert.equal(slot.state, "booked");
  assert.deepEqual(Object.keys(slot).sort(), ["slot_end", "slot_start", "state", "surface_id", "surface_name"]);
  const inactive = await createFacility(db.pool);
  await db.pool.query("update public.facilities set is_active = false where id = $1", [inactive.id]);
  const none = await asUser(db.pool, null, (c) => c.query("select * from public.facility_availability($1, $2)", [inactive.id, day]));
  assert.equal(none.rowCount, 0);
});

test("readiness lists what is missing instead of assuming defaults", async () => {
  const cat = (await db.pool.query("select id from public.sport_categories where slug = 'basketball'")).rows[0].id;
  const id = (await db.pool.query(
    "insert into public.facilities (slug, name, sport_category_id) values ($1, 'Unconfigured', $2) returning id",
    [`u-${randomUUID().slice(0, 8)}`, cat])).rows[0].id;
  const r = (await db.pool.query("select public.facility_booking_readiness($1) v", [id])).rows[0].v;
  assert.equal(r.bookable, false);
  assert.deepEqual(r.missing.sort(), ["facility_inactive", "no_active_surface", "opening_hours_not_set", "slot_duration_not_set"]);
});
