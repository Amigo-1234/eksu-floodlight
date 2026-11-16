// 0011: pre-launch — only authorised testers can book, and their bookings are marked TEST.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase, createUser, createFacility, makeOwner, grantRole, rpc, slotStart, bookingSql } from "./harness.mjs";

let db;
before(async () => {
  db = await createTestDatabase();
  await db.pool.query("update floodlight.platform_settings set public_booking_open = false where id = 1");
});
after(async () => { await db?.drop(); });

const code = (r) => (r.ok ? "OK" : (r.message.match(/^[A-Z_]+/)?.[0] ?? r.message));
const book = (u, surface, start) => rpc(db.pool, u, bookingSql, [surface, start, "Organiser", null, "o@example.test"]);

test("before launch: ordinary customers are refused by the database", async () => {
  const f = await createFacility(db.pool);
  const u = await createUser(db.pool, `c-${randomUUID()}@example.test`);
  assert.equal(code(await book(u, f.surfaces[0], await slotStart(db.pool, 30))), "BOOKINGS_NOT_OPEN");
  const acc = (await rpc(db.pool, u, "select floodlight.booking_access()")).value;
  assert.deepEqual([acc.public_open, acc.can_book, acc.test_mode], [false, false, true]);
  const anon = (await rpc(db.pool, null, "select floodlight.booking_access()")).value;
  assert.equal(anon.can_book, false);
});

test("before launch: owner, staff and listed testers can book; bookings are TEST and never public", async () => {
  const f = await createFacility(db.pool);
  const owner = await createUser(db.pool, `o-${randomUUID()}@example.test`); await makeOwner(db.pool, owner);
  const staff = await createUser(db.pool, `s-${randomUUID()}@example.test`); await grantRole(db.pool, staff, f.id, "gatekeeper");
  const tester = await createUser(db.pool, `t-${randomUUID()}@example.test`);
  await db.pool.query("insert into floodlight.booking_testers (user_id, note) values ($1, 'QA')", [tester]);
  let h = 30;
  for (const u of [owner, staff, tester]) {
    const r = await rpc(db.pool, u, "select floodlight.create_booking($1, $2, 'Org', null, 'o@example.test', 'friendly', null, null, null, null, null, true)",
      [f.surfaces[0], await slotStart(db.pool, h++)]);
    assert.equal(code(r), "OK");
    const row = (await db.pool.query("select is_test, public_listing from floodlight.bookings where id = $1", [r.value.id])).rows[0];
    assert.deepEqual(row, { is_test: true, public_listing: false });
    assert.equal((await rpc(db.pool, u, "select floodlight.booking_access()")).value.can_book, true);
  }
});

test("clients cannot mark bookings as test/real or add themselves as testers", async () => {
  const u = await createUser(db.pool, `x-${randomUUID()}@example.test`);
  assert.equal((await rpc(db.pool, u, "insert into floodlight.booking_testers (user_id) values (auth.uid())")).ok, false);
  assert.equal((await rpc(db.pool, u, "update floodlight.platform_settings set public_booking_open = true where id = 1 returning id")).rows?.length ?? 0, 0);
});

test("a test booking approved with the waiver is 'waived', never 'paid'", async () => {
  const f = await createFacility(db.pool, { slotMinutes: 75, policy: { payment_mode: "online", approval_mode: "required" } });
  await db.pool.query("insert into floodlight.facility_prices (facility_id, label, amount_kobo, is_default) values ($1, 'Per session', 400000, true)", [f.id]);
  const owner = await createUser(db.pool, `o2-${randomUUID()}@example.test`); await makeOwner(db.pool, owner);
  const bk = await book(owner, f.surfaces[0], await slotStart(db.pool, 40));
  assert.equal(code(bk), "OK");
  let r = (await db.pool.query("select status, payment_status, amount_due_kobo::int a, is_test from floodlight.bookings where id = $1", [bk.value.id])).rows[0];
  assert.deepEqual(r, { status: "pending", payment_status: "pending", a: 400000, is_test: true });
  assert.equal(code(await rpc(db.pool, owner, "select floodlight.start_online_payment($1)", [bk.value.id])), "ONLINE_PAYMENTS_DISABLED");
  assert.equal(code(await rpc(db.pool, owner, "select floodlight.review_booking($1, 'approve', 'TEST WAIVER', true)", [bk.value.id])), "OK");
  r = (await db.pool.query("select status, payment_status from floodlight.bookings where id = $1", [bk.value.id])).rows[0];
  assert.deepEqual(r, { status: "confirmed", payment_status: "waived" });
  const tx = (await db.pool.query("select count(*)::int n from floodlight.payment_transactions where booking_id = $1", [bk.value.id])).rows[0].n;
  assert.equal(tx, 0);
});

test("after launch: customers can book and bookings are real", async () => {
  await db.pool.query("update floodlight.platform_settings set public_booking_open = true where id = 1");
  const f = await createFacility(db.pool);
  const u = await createUser(db.pool, `l-${randomUUID()}@example.test`);
  const r = await book(u, f.surfaces[0], await slotStart(db.pool, 50));
  assert.equal(code(r), "OK");
  assert.equal((await db.pool.query("select is_test from floodlight.bookings where id = $1", [r.value.id])).rows[0].is_test, false);
  await db.pool.query("update floodlight.platform_settings set public_booking_open = false where id = 1");
});
