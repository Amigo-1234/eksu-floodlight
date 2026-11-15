// Cross-application isolation tests. Run with EKSU Sports Hub's REAL schema +
// seed installed underneath Floodlight (FLOODLIGHT_COEXIST=1), mirroring the
// shared Supabase project.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createTestDatabase, createUser, createFacility, grantRole, makeOwner, rpc, asUser, slotStart } from "./harness.mjs";

const enabled = process.env.FLOODLIGHT_COEXIST === "1";
let db;
before(async () => { if (enabled) db = await createTestDatabase(); });
after(async () => { await db?.drop(); });

const err = (r) => (r.ok ? "OK" : (r.message.match(/^[A-Z_]+/)?.[0] ?? r.message));

async function sportsHubAdmin() {
  const id = await createUser(db.pool, `sh-admin-${randomUUID()}@test.local`);
  await db.pool.query(
    "insert into public.user_roles (user_id, role_id) select $1, id from public.roles where code = 'ADMIN'", [id]);
  return id;
}

test("Sports Hub sign-ups do not create Floodlight rows (and vice versa nothing is auto-provisioned)", { skip: !enabled }, async () => {
  const id = await createUser(db.pool, `sh-only-${randomUUID()}@test.local`);
  const sh = await db.pool.query("select count(*)::int n from public.profiles where id = $1", [id]);
  const fl = await db.pool.query("select count(*)::int n from floodlight.profiles where id = $1", [id]);
  assert.equal(sh.rows[0].n, 1, "Sports Hub's own trigger still creates its profile");
  assert.equal(fl.rows[0].n, 0, "Floodlight creates nothing on sign-up");
  const ensured = await rpc(db.pool, id, "select floodlight.ensure_profile()");
  assert.ok(ensured.ok, ensured.message);
  const fl2 = await db.pool.query("select count(*)::int n from floodlight.profiles where id = $1", [id]);
  assert.equal(fl2.rows[0].n, 1, "profile appears only when the user first uses Floodlight");
});

test("a Sports Hub ADMIN has no Floodlight staff powers", { skip: !enabled }, async () => {
  const shAdmin = await sportsHubAdmin();
  const f = await createFacility(db.pool);
  const u = await createUser(db.pool, `cust-${randomUUID()}@test.local`);
  const b = await rpc(db.pool, u, `select floodlight.create_booking(p_surface_id => $1, p_start => $2, p_organizer_name => 'Org', p_organizer_email => 'o@x.test')`,
    [f.surfaces[0], await slotStart(db.pool, 30)]);
  assert.ok(b.ok, b.message);
  assert.equal(err(await rpc(db.pool, shAdmin, "select floodlight.review_booking($1, 'approve')", [b.value.id])), "FORBIDDEN");
  assert.equal(err(await rpc(db.pool, shAdmin, "select floodlight.admin_overview(null)")), "FORBIDDEN");
  const seen = await asUser(db.pool, shAdmin, (c) => c.query("select id from floodlight.bookings"));
  assert.equal(seen.rowCount, 0, "Sports Hub admins cannot read Floodlight bookings");
  const roles = await rpc(db.pool, shAdmin, "select floodlight.my_roles()");
  assert.equal(roles.value.is_platform_owner, false);
  assert.deepEqual(roles.value.memberships, []);
});

test("a Floodlight platform owner has no Sports Hub admin powers", { skip: !enabled }, async () => {
  const owner = await createUser(db.pool, `fl-owner-${randomUUID()}@test.local`);
  await makeOwner(db.pool, owner);
  const r = await rpc(db.pool, owner, "select * from public.admin_list_staff()");
  assert.equal(r.ok, false);
  assert.match(r.message, /Administrator access required/);
  const ins = await rpc(db.pool, owner, "insert into public.venues (name) values ('X') returning id");
  assert.equal(ins.ok, false, "Floodlight owners cannot write Sports Hub tables");
  const shStaff = await rpc(db.pool, owner, "select count(*) from public.user_roles where user_id <> $1", [owner]);
  assert.equal(Number(shStaff.value), 0, "cannot read other users' Sports Hub roles");
});

test("Floodlight customers cannot read Sports Hub private data; Sports Hub users cannot read Floodlight private data", { skip: !enabled }, async () => {
  const cust = await createUser(db.pool, `fl-cust-${randomUUID()}@test.local`);
  for (const t of ["public.registrations", "public.player_identities", "public.audit_log", "public.notification_outbox"]) {
    const r = await rpc(db.pool, cust, `select count(*) from ${t}`);
    assert.ok(!r.ok || Number(r.value) === 0, `${t} must not be readable`);
  }
  const shUser = await createUser(db.pool, `sh-user-${randomUUID()}@test.local`);
  for (const t of ["floodlight.bookings", "floodlight.profiles", "floodlight.audit_log", "floodlight.check_ins", "floodlight.payment_transactions"]) {
    const r = await rpc(db.pool, shUser, `select count(*) from ${t}`);
    assert.ok(!r.ok || Number(r.value) === 0, `${t} must not be readable`);
  }
  const secret = await rpc(db.pool, shUser, "select count(*) from floodlight_private.app_secrets");
  assert.equal(secret.ok, false, "the pass-signing key is never readable");
});

test("deleting an auth user is not blocked by Floodlight rows (Sports Hub user management keeps working)", { skip: !enabled }, async () => {
  const f = await createFacility(db.pool, { policy: { approval_mode: "automatic", payment_mode: "free" } });
  const u = await createUser(db.pool, `leaving-${randomUUID()}@test.local`);
  await rpc(db.pool, u, "select floodlight.ensure_profile()");
  const b = await rpc(db.pool, u, `select floodlight.create_booking(p_surface_id => $1, p_start => $2, p_organizer_name => 'Leaver', p_organizer_email => 'l@x.test')`,
    [f.surfaces[0], await slotStart(db.pool, 31)]);
  assert.ok(b.ok, b.message);
  await db.pool.query("delete from auth.users where id = $1", [u]);
  const row = await db.pool.query("select customer_id, created_by, reference from floodlight.bookings where id = $1", [b.value.id]);
  assert.equal(row.rows[0].customer_id, null);
  assert.equal(row.rows[0].created_by, null);
  assert.ok(row.rows[0].reference, "booking history is kept for the facility");
});

test("Floodlight storage policies never error on Sports Hub's bucket", { skip: !enabled }, async () => {
  const u = await createUser(db.pool, `st-${randomUUID()}@test.local`);
  // A non-UUID path in Sports Hub's private bucket: must be refused by RLS (42501),
  // never by a Floodlight cast error (22P02).
  const r = await rpc(db.pool, u, "insert into storage.objects (bucket_id, name) values ('registration-documents', 'not-a-uuid/photo.jpg')");
  assert.equal(r.ok, false);
  assert.equal(r.code, "42501", `expected RLS refusal, got ${r.code} ${r.message}`);
  // A Floodlight non-admin cannot upload into Floodlight's bucket either.
  const f = await createFacility(db.pool);
  const r2 = await rpc(db.pool, u, "insert into storage.objects (bucket_id, name) values ('floodlight-facility-images', $1)", [`${f.id}/x.jpg`]);
  assert.equal(r2.code, "42501");
  // A facility admin can.
  const admin = await createUser(db.pool, `st-admin-${randomUUID()}@test.local`);
  await grantRole(db.pool, admin, f.id, "facility_admin");
  const r3 = await rpc(db.pool, admin, "insert into storage.objects (bucket_id, name) values ('floodlight-facility-images', $1)", [`${f.id}/ok.jpg`]);
  assert.ok(r3.ok, r3.message);
  // …but not into Sports Hub's bucket.
  const r4 = await rpc(db.pool, admin, "insert into storage.objects (bucket_id, name) values ('registration-documents', $1)", [`${f.id}/x.jpg`]);
  assert.equal(r4.code, "42501");
});

test("Sports Hub's private schema and functions are untouched by Floodlight", { skip: !enabled }, async () => {
  const r = await db.pool.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ~* 'floodlight'`);
  assert.equal(r.rows[0].n, 0, "no Sports Hub function references Floodlight");
  const t = await db.pool.query(`select count(*)::int n from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'auth' and not t.tgisinternal`);
  assert.equal(t.rows[0].n, 1, "auth.users still has exactly one trigger (Sports Hub's)");
});
