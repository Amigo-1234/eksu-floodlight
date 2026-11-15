// 0009: safeguards for public customer self-registration.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase, createUser, createFacility, rpc, slotStart, bookingSql } from "./harness.mjs";

let db;
before(async () => { db = await createTestDatabase(); });
after(async () => { await db?.drop(); });

const code = (r) => (r.ok ? "OK" : (r.message.match(/^[A-Z_]+/)?.[0] ?? r.message));
const book = (u, surface, start) => rpc(db.pool, u, bookingSql, [surface, start, "Organiser", null, "o@example.test"]);
const setLimits = (rate, upcoming) => db.pool.query(
  "update floodlight.platform_settings set max_booking_requests_per_hour = $1, max_upcoming_bookings_per_customer = $2 where id = 1", [rate, upcoming]);

test("an account with an unconfirmed email cannot book (database backstop)", async () => {
  const f = await createFacility(db.pool);
  const u = await createUser(db.pool, `unverified-${randomUUID()}@example.test`, "New Student", { verified: false });
  const r = await book(u, f.surfaces[0], await slotStart(db.pool, 30));
  assert.equal(code(r), "EMAIL_NOT_VERIFIED");
  const n = await db.pool.query("select count(*)::int n from floodlight.bookings where created_by = $1", [u]);
  assert.equal(n.rows[0].n, 0);
  // once confirmed, the same account can book
  await db.pool.query("update auth.users set email_confirmed_at = now() where id = $1", [u]);
  assert.equal(code(await book(u, f.surfaces[0], await slotStart(db.pool, 30))), "OK");
});

test("my_account_status reports only the caller's own verification state", async () => {
  const v = await createUser(db.pool, `v-${randomUUID()}@example.test`);
  const nv = await createUser(db.pool, `nv-${randomUUID()}@example.test`, "X", { verified: false });
  assert.deepEqual((await rpc(db.pool, v, "select floodlight.my_account_status()")).value, { email_verified: true });
  assert.deepEqual((await rpc(db.pool, nv, "select floodlight.my_account_status()")).value, { email_verified: false });
  const anon = await rpc(db.pool, null, "select floodlight.my_account_status()");
  assert.equal(anon.ok, false, "anon cannot call it");
});

test("a newly registered customer gets no staff or owner powers", async () => {
  const u = await createUser(db.pool, `new-${randomUUID()}@example.test`);
  assert.ok((await rpc(db.pool, u, "select floodlight.ensure_profile()")).ok);
  const roles = (await rpc(db.pool, u, "select floodlight.my_roles()")).value;
  assert.equal(roles.is_platform_owner, false);
  assert.deepEqual(roles.memberships, []);
  const f = await createFacility(db.pool);
  for (const r of ["facility_admin", "scheduler", "gatekeeper", "platform_owner"]) {
    assert.equal(code(await rpc(db.pool, u, "select floodlight.invite_staff($1, $2, $3)", [`x-${randomUUID()}@example.test`, r, f.id])), "FORBIDDEN", r);
  }
  const boot = await rpc(db.pool, u, "select floodlight_private.bootstrap_platform_owner($1)", ["anyone@example.test"]);
  assert.equal(boot.ok, false, "bootstrap is not callable by API roles");
  const own = await rpc(db.pool, u, "insert into floodlight.platform_owners (user_id) values (auth.uid())");
  assert.equal(own.ok, false, "cannot insert themselves as owner");
  const mem = await rpc(db.pool, u, "insert into floodlight.staff_memberships (user_id, facility_id, role) values (auth.uid(), $1, 'facility_admin')", [f.id]);
  assert.equal(mem.ok, false, "cannot grant themselves a staff role");
  const prof = await rpc(db.pool, u, "update floodlight.profiles set full_name = $$Renamed Student$$ where id = auth.uid() returning id");
  assert.ok(prof.ok, "can still update own profile");
});

test("hourly booking-request limit per account", async () => {
  await setLimits(2, 50);
  const f = await createFacility(db.pool);
  const u = await createUser(db.pool, `rate-${randomUUID()}@example.test`);
  assert.equal(code(await book(u, f.surfaces[0], await slotStart(db.pool, 30))), "OK");
  assert.equal(code(await book(u, f.surfaces[0], await slotStart(db.pool, 32))), "OK");
  assert.equal(code(await book(u, f.surfaces[0], await slotStart(db.pool, 34))), "BOOKING_RATE_LIMITED");
  const other = await createUser(db.pool, `rate2-${randomUUID()}@example.test`);
  assert.equal(code(await book(other, f.surfaces[0], await slotStart(db.pool, 36))), "OK", "limit is per account");
  await setLimits(10, 6);
});

test("upcoming active bookings limit per account (cancelled ones free a place)", async () => {
  await setLimits(50, 2);
  const f = await createFacility(db.pool);
  const u = await createUser(db.pool, `up-${randomUUID()}@example.test`);
  const a = await book(u, f.surfaces[0], await slotStart(db.pool, 40));
  assert.equal(code(a), "OK");
  assert.equal(code(await book(u, f.surfaces[0], await slotStart(db.pool, 42))), "OK");
  assert.equal(code(await book(u, f.surfaces[0], await slotStart(db.pool, 44))), "UPCOMING_BOOKING_LIMIT");
  await db.pool.query("update floodlight.bookings set status = 'cancelled' where id = $1", [a.value.id]);
  assert.equal(code(await book(u, f.surfaces[0], await slotStart(db.pool, 44))), "OK");
  await setLimits(10, 6);
});

test("concurrent requests from one account cannot exceed the limit", async () => {
  await setLimits(50, 3);
  const f = await createFacility(db.pool, { surfaces: ["S1", "S2", "S3", "S4", "S5", "S6"] });
  const u = await createUser(db.pool, `cc-${randomUUID()}@example.test`);
  const start = await slotStart(db.pool, 50);
  const rs = await Promise.all(f.surfaces.map((s) => book(u, s, start)));
  assert.equal(rs.filter((r) => r.ok).length, 3, rs.map(code).join(","));
  await setLimits(10, 6);
});
