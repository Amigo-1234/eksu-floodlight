// Database test harness: creates a throwaway PostgreSQL database, applies the
// Supabase platform shim and the generated Floodlight bundle (optionally on top
// of EKSU Sports Hub's real schema: FLOODLIGHT_COEXIST=1), and gives tests helpers
// to act as a specific user exactly as PostgREST would (role + JWT claims).
//
// Requires a PostgreSQL server you control (never a production database):
//   FLOODLIGHT_TEST_PG=postgres://postgres@127.0.0.1:54329/postgres npm run test:db
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const adminUrl = process.env.FLOODLIGHT_TEST_PG;

export function requireTestDatabase() {
  if (!adminUrl) throw new Error("Set FLOODLIGHT_TEST_PG to an admin URL of a disposable PostgreSQL server.");
  if (/supabase\.(co|com)/.test(adminUrl)) throw new Error("Refusing to run destructive tests against a Supabase host.");
  return adminUrl;
}

export async function createTestDatabase() {
  const url = requireTestDatabase();
  const name = `fl_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const dbUrl = new URL(url);
  dbUrl.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: dbUrl.toString(), max: 60 });
  const c = await pool.connect();
  try {
    await c.query("set client_min_messages = warning");
    await c.query(readFileSync(join(root, "tests/coexistence/platform_shim.sql"), "utf8"));
    // Coexistence mode: install EKSU Sports Hub's REAL schema + seed first (read
    // from its repository, never modified), exactly as on the shared project.
    if (process.env.FLOODLIGHT_COEXIST === "1") {
      const sh = join(process.env.SPORTS_HUB_DIR ?? join(process.env.HOME ?? "", "Documents/Eksu-Projects/eksu-sports-hub"), "supabase");
      for (const f of readdirSync(join(sh, "migrations")).filter((x) => x.endsWith(".sql")).sort()) {
        await c.query(readFileSync(join(sh, "migrations", f), "utf8"));
      }
      await c.query(`begin; ${readFileSync(join(sh, "seed.sql"), "utf8")}; commit;`);
    }
    // Floodlight is installed exactly as it would be remotely: the generated bundle.
    await c.query(readFileSync(join(root, "db/dist/floodlight_bundle.sql"), "utf8"));
  } finally {
    c.release();
  }

  return {
    pool,
    async drop() {
      await pool.end();
      const a = new pg.Client({ connectionString: url });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/** Run `fn(client)` inside a transaction as the given user (or anon when user is null). */
export async function asUser(pool, user, fn, { aal = "aal1" } = {}) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const claims = user
      ? { sub: user, role: "authenticated", aal }
      : { role: "anon" };
    await c.query(`set local role ${user ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Call an RPC as a user; resolves to { ok, value } or { ok:false, code, message }. */
export async function rpc(pool, user, sql, params = []) {
  try {
    const r = await asUser(pool, user, (c) => c.query(sql, params));
    return { ok: true, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined, rows: r.rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  }
}

export async function createUser(pool, email, fullName = "Test User") {
  const id = randomUUID();
  await pool.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, email, { full_name: fullName }]);
  return id;
}

/**
 * Creates a facility directly (as the database owner) with a complete policy:
 * open every day 00:00–24:00, `slotMinutes` slots, one or more surfaces.
 * These are TEST rows, unrelated to any real EKSU facility.
 */
export async function createFacility(pool, {
  name = "Test Facility", slotMinutes = 60, surfaces = ["Surface A"], policy = {},
} = {}) {
  const cat = (await pool.query("select id from floodlight.sport_categories where slug = 'football'")).rows[0].id;
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const f = (await pool.query(
    `insert into floodlight.facilities (slug, name, sport_category_id, is_active, is_dev_fixture)
     values ($1, $2, $3, true, true) returning id`, [slug, name, cat])).rows[0].id;
  const set = { slot_minutes: slotMinutes, ...policy };
  const cols = Object.keys(set);
  await pool.query(
    `update floodlight.booking_policies set ${cols.map((k, i) => `${k} = $${i + 2}`).join(", ")} where facility_id = $1`,
    [f, ...cols.map((k) => set[k])]);
  for (let d = 0; d < 7; d++) {
    await pool.query("insert into floodlight.operating_hours (facility_id, weekday, opens_at, closes_at) values ($1, $2, '00:00', '24:00')", [f, d]);
  }
  const surfaceIds = [];
  for (const s of surfaces) {
    surfaceIds.push((await pool.query("insert into floodlight.playing_surfaces (facility_id, name) values ($1, $2) returning id", [f, s])).rows[0].id);
  }
  return { id: f, surfaces: surfaceIds };
}

export async function grantRole(pool, userId, facilityId, role) {
  await pool.query("insert into floodlight.staff_memberships (user_id, facility_id, role) values ($1, $2, $3)", [userId, facilityId, role]);
}

export async function makeOwner(pool, userId) {
  await pool.query("insert into floodlight.platform_owners (user_id) values ($1)", [userId]);
}

/** Start of the slot `hoursAhead` hours from now, aligned to the hour, in Africa/Lagos. */
export async function slotStart(pool, hoursAhead) {
  const r = await pool.query(
    `select (date_trunc('hour', now() at time zone 'Africa/Lagos') + make_interval(hours => $1::int))
            at time zone 'Africa/Lagos' as t`, [hoursAhead]);
  return r.rows[0].t;
}

/** The slot currently under way (for gate tests). */
export async function currentSlotStart(pool) {
  return slotStart(pool, 0);
}

export const bookingSql = `select floodlight.create_booking($1, $2, $3, $4, $5)`;
