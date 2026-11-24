// 0012: manual payment — accept → bank transfer → receipt upload → staff verification,
// with deadlines that release held sessions.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase, createUser, createFacility, makeOwner, rpc, slotStart, bookingSql } from "./harness.mjs";

let db, owner;
before(async () => {
  db = await createTestDatabase();
  owner = await createUser(db.pool, `owner-${randomUUID()}@example.test`);
  await makeOwner(db.pool, owner);
});
after(async () => { await db?.drop(); });

const code = (r) => (r.ok ? "OK" : (r.message.match(/^[A-Z_]+/)?.[0] ?? r.message));
const row = async (id) => (await db.pool.query(
  "select status, approval_status a, payment_status p, proof_status ps, proof_attempts n, approval_deadline ad, payment_deadline pd, lower(period) s from floodlight.bookings where id = $1", [id])).rows[0];

async function facility() {
  const f = await createFacility(db.pool, { slotMinutes: 60, policy: { payment_mode: "offline", approval_mode: "required" } });
  await db.pool.query("insert into floodlight.facility_prices (facility_id, label, amount_kobo, is_default) values ($1, 'Per session', 300000, true)", [f.id]);
  return f;
}
async function request(f, hours) {
  const u = await createUser(db.pool, `c-${randomUUID()}@example.test`);
  const r = await rpc(db.pool, u, bookingSql, [f.surfaces[0], await slotStart(db.pool, hours), "Student", null, "s@example.test"]);
  assert.equal(code(r), "OK", r.message);
  return { u, id: r.value.id };
}
const upload = (u, path) => rpc(db.pool, u, "insert into storage.objects (bucket_id, name, owner) values ('floodlight-payment-proofs', $1, auth.uid()) returning id", [path]);
const submit = (u, id, path) => rpc(db.pool, u, "select floodlight.submit_payment_proof($1, $2, 'receipt.jpg')", [id, path]);
const review = (proof, decision, reason = null) => rpc(db.pool, owner, "select floodlight.review_payment_proof($1, $2, $3)", [proof, decision, reason]);
const latestProof = async (id) => (await db.pool.query("select id from floodlight.payment_proofs where booking_id = $1 order by created_at desc limit 1", [id])).rows[0].id;

test("deadlines: accept within 12 h (≤ 2 h before start); pay within 6 h of acceptance (≤ 1 h before start)", async () => {
  const f = await facility();
  const { id } = await request(f, 48);
  let b = await row(id);
  const now = Date.now();
  assert.ok(Math.abs(new Date(b.ad).getTime() - (now + 12 * 3600e3)) < 120e3, "far session: 12 h to accept");
  assert.equal(b.pd, null);
  assert.equal(code(await rpc(db.pool, owner, "select floodlight.review_booking($1, 'approve')", [id])), "OK");
  b = await row(id);
  assert.deepEqual([b.status, b.a, b.p], ["pending", "approved", "pending"], "accepted, payment due — not confirmed");
  assert.ok(Math.abs(new Date(b.pd).getTime() - (Date.now() + 6 * 3600e3)) < 120e3, "6 h to pay");

  const near = await request(f, 5);
  b = await row(near.id);
  assert.ok(Math.abs(new Date(b.ad).getTime() - (new Date(b.s).getTime() - 2 * 3600e3)) < 1000, "near session: 2 h before start");
});

test("full flow: receipt upload → staff accepts → verified bank transfer → confirmed with receipt", async () => {
  const f = await facility();
  const { u, id } = await request(f, 30);
  const other = await createUser(db.pool, `o-${randomUUID()}@example.test`);
  assert.equal((await upload(u, `${id}/early.jpg`)).ok, false, "cannot upload before acceptance");
  assert.equal(code(await submit(u, id, `${id}/early.jpg`)), "NOT_AWAITING_PAYMENT");
  await rpc(db.pool, owner, "select floodlight.review_booking($1, 'approve')", [id]);

  assert.equal((await upload(other, `${id}/x.jpg`)).ok, false, "another user cannot upload into this booking");
  assert.equal(code(await submit(other, id, `${id}/x.jpg`)), "NOT_FOUND");
  assert.equal(code(await submit(u, id, `${id}/missing.jpg`)), "PROOF_FILE_MISSING");
  assert.ok((await upload(u, `${id}/r1.jpg`)).ok);
  assert.equal(code(await submit(u, id, `${id}/r1.jpg`)), "OK");
  assert.equal((await row(id)).ps, "submitted");
  assert.equal((await upload(u, `${id}/r2.jpg`)).ok, false, "no second upload while one is under review");
  const seen = await rpc(db.pool, other, "select count(*)::int from floodlight.payment_proofs where booking_id = $1", [id]);
  assert.equal(seen.value, 0, "others cannot see the receipt");
  const notes = (await db.pool.query("select count(*)::int n from floodlight.notifications where user_id = $1 and kind = 'payment.proof_submitted'", [owner])).rows[0].n;
  assert.ok(notes >= 1, "staff notified");

  assert.equal(code(await rpc(db.pool, u, "select floodlight.review_payment_proof($1, 'accept')", [await latestProof(id)])), "FORBIDDEN", "customers cannot verify");
  const ok = await review(await latestProof(id), "accept");
  assert.equal(ok.value.status, "confirmed");
  const b = await row(id);
  assert.deepEqual([b.status, b.p, b.ps], ["confirmed", "paid", "accepted"]);
  const tx = (await db.pool.query("select amount_kobo::int a, method, provider from floodlight.payment_transactions where booking_id = $1", [id])).rows;
  assert.deepEqual(tx, [{ a: 300000, method: "bank_transfer", provider: "offline" }], "amount from the booking, never the client");
  const rc = (await db.pool.query("select count(*)::int n from floodlight.receipts where booking_id = $1", [id])).rows[0].n;
  assert.equal(rc, 1);
});

test("rejected receipt: one retry, second rejection cancels and frees the session", async () => {
  const f = await facility();
  const { u, id } = await request(f, 40);
  await rpc(db.pool, owner, "select floodlight.review_booking($1, 'approve')", [id]);
  await upload(u, `${id}/a.jpg`); await submit(u, id, `${id}/a.jpg`);
  assert.equal(code(await review(await latestProof(id), "reject")), "REASON_REQUIRED");
  assert.equal(code(await review(await latestProof(id), "reject", "Amount not visible")), "OK");
  let b = await row(id);
  assert.deepEqual([b.status, b.ps, b.n], ["pending", "rejected", 1]);
  assert.ok((await upload(u, `${id}/b.jpg`)).ok, "can upload again");
  assert.equal(code(await submit(u, id, `${id}/b.jpg`)), "OK");
  assert.equal(code(await review(await latestProof(id), "reject", "Wrong account")), "OK");
  b = await row(id);
  assert.deepEqual([b.status, b.ps, b.n], ["cancelled", "rejected", 2]);
  const again = await createUser(db.pool, `n-${randomUUID()}@example.test`);
  const r = await rpc(db.pool, again, bookingSql, [f.surfaces[0], await slotStart(db.pool, 40), "Next", null, "n@example.test"]);
  assert.equal(code(r), "OK", "session released for others");
});

test("housekeeping expires unreviewed and unpaid requests, but not ones with a receipt under review", async () => {
  const f = await facility();
  const a = await request(f, 50);
  await db.pool.query("update floodlight.bookings set approval_deadline = now() - interval '1 minute' where id = $1", [a.id]);
  const p = await request(f, 52);
  await rpc(db.pool, owner, "select floodlight.review_booking($1, 'approve')", [p.id]);
  await db.pool.query("update floodlight.bookings set payment_deadline = now() - interval '1 minute' where id = $1", [p.id]);
  const q = await request(f, 54);
  await rpc(db.pool, owner, "select floodlight.review_booking($1, 'approve')", [q.id]);
  await upload(q.u, `${q.id}/r.jpg`); await submit(q.u, q.id, `${q.id}/r.jpg`);
  await db.pool.query("update floodlight.bookings set payment_deadline = now() - interval '1 minute' where id = $1", [q.id]);

  const res = (await db.pool.query("select floodlight_private.run_booking_housekeeping() r")).rows[0].r;
  assert.ok(res.expired_unreviewed >= 1 && res.expired_unpaid >= 1, JSON.stringify(res));
  assert.equal((await row(a.id)).status, "expired");
  assert.equal((await row(p.id)).status, "expired");
  assert.equal((await row(q.id)).status, "pending", "receipt waiting for staff keeps the booking");
  assert.equal(code(await submit(p.u, p.id, `${p.id}/late.jpg`)), "NOT_AWAITING_PAYMENT");
});
