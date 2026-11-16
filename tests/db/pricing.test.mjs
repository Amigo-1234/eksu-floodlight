// 0010: the price is recorded on bookings while the payment method is undecided,
// without ever making a booking payable or paid.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase, createUser, createFacility, makeOwner, rpc, slotStart, bookingSql } from "./harness.mjs";

let db;
before(async () => { db = await createTestDatabase(); });
after(async () => { await db?.drop(); });

const code = (r) => (r.ok ? "OK" : (r.message.match(/^[A-Z_]+/)?.[0] ?? r.message));
const book = (u, surface, start) => rpc(db.pool, u, bookingSql, [surface, start, "Organiser", null, "o@example.test"]);
const price = (f, kobo) => db.pool.query(
  "insert into floodlight.facility_prices (facility_id, label, amount_kobo, is_default) values ($1, 'Per hour (60-minute slot)', $2, true)", [f, kobo]);

test("unconfigured payment: each booked slot carries the facility price, payment stays unconfigured", async () => {
  const f = await createFacility(db.pool, { slotMinutes: 60, policy: { payment_mode: "unconfigured", approval_mode: "required" } });
  await price(f.id, 400000);
  const u = await createUser(db.pool, `p-${randomUUID()}@example.test`);
  const a = await book(u, f.surfaces[0], await slotStart(db.pool, 30));
  const b = await book(u, f.surfaces[0], await slotStart(db.pool, 31));
  assert.equal(code(a), "OK"); assert.equal(code(b), "OK");
  const rows = (await db.pool.query(
    "select amount_due_kobo::int a, payment_status p, status s, price_snapshot->>'collection' c from floodlight.bookings where id = any($1) order by lower(period)",
    [[a.value.id, b.value.id]])).rows;
  assert.deepEqual(rows.map((r) => r.a), [400000, 400000], "₦4,000 per one-hour slot");
  assert.equal(rows.reduce((n, r) => n + r.a, 0), 800000, "two hours = ₦8,000, computed server-side");
  assert.ok(rows.every((r) => r.p === "unconfigured" && r.s === "pending" && r.c === "not_yet_decided"));
});

test("an unconfigured-payment booking can never be paid or collected", async () => {
  const f = await createFacility(db.pool, { slotMinutes: 60, policy: { payment_mode: "unconfigured", approval_mode: "required" } });
  await price(f.id, 400000);
  const owner = await createUser(db.pool, `o-${randomUUID()}@example.test`); await makeOwner(db.pool, owner);
  const u = await createUser(db.pool, `c-${randomUUID()}@example.test`);
  const bk = await book(u, f.surfaces[0], await slotStart(db.pool, 40));
  const id = bk.value.id;
  const online = code(await rpc(db.pool, u, "select floodlight.start_online_payment($1)", [id]));
  assert.ok(["ONLINE_PAYMENTS_DISABLED", "PAYMENT_NOT_DUE"].includes(online), online);
  assert.equal(code(await rpc(db.pool, owner, "select floodlight.record_offline_payment($1, 400000, 'cash', 'R-1')", [id])), "OFFLINE_PAYMENT_NOT_ENABLED");
  // approval alone does not confirm; nothing is marked paid
  assert.equal(code(await rpc(db.pool, owner, "select floodlight.review_booking($1, 'approve')", [id])), "OK");
  const r = (await db.pool.query("select status, payment_status, amount_due_kobo::int a from floodlight.bookings where id = $1", [id])).rows[0];
  assert.deepEqual(r, { status: "pending", payment_status: "unconfigured", a: 400000 });
  const tx = (await db.pool.query("select count(*)::int n from floodlight.payment_transactions where booking_id = $1", [id])).rows[0].n;
  assert.equal(tx, 0, "no payment record invented");
});

test("price changes never alter existing bookings (snapshot at booking time)", async () => {
  const f = await createFacility(db.pool, { slotMinutes: 60, policy: { payment_mode: "unconfigured" } });
  await price(f.id, 400000);
  const u = await createUser(db.pool, `s-${randomUUID()}@example.test`);
  const bk = await book(u, f.surfaces[0], await slotStart(db.pool, 50));
  await db.pool.query("update floodlight.facility_prices set amount_kobo = 500000 where facility_id = $1", [f.id]);
  const a = (await db.pool.query("select amount_due_kobo::int a from floodlight.bookings where id = $1", [bk.value.id])).rows[0].a;
  assert.equal(a, 400000);
});

test("free facilities still charge nothing", async () => {
  const f = await createFacility(db.pool, { slotMinutes: 60, policy: { payment_mode: "free" } });
  await price(f.id, 400000);
  const u = await createUser(db.pool, `f-${randomUUID()}@example.test`);
  const bk = await book(u, f.surfaces[0], await slotStart(db.pool, 60));
  const r = (await db.pool.query("select amount_due_kobo a, payment_status p from floodlight.bookings where id = $1", [bk.value.id])).rows[0];
  assert.equal(r.a, null); assert.equal(r.p, "not_required");
});
