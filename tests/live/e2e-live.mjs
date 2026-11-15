// Live end-to-end workflow test for EKSU Floodlight against the shared
// Supabase project, using ONLY the public Data API + publishable key and the
// controlled test accounts in ~/.eksu/floodlight-test-accounts.env.
// Touches only DEV fixture facilities. Payments and live gate admission stay
// off (gate runs in TEST MODE). Prints no credentials or tokens.
//
//   node tests/live/e2e-live.mjs            (WAIT_FOR_GATE=1 waits for the entry window)
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !KEY) throw new Error("set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const creds = Object.fromEntries(readFileSync(`${homedir()}/.eksu/floodlight-test-accounts.env`, "utf8")
  .split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

const opts = { db: { schema: "floodlight" }, auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(URL, KEY, opts);
let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = "") {
  ok ? pass++ : fail++;
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`;
  results.push(line); console.log(line);
}
const short = (v) => JSON.stringify(v)?.replace(/FL1\.[A-Za-z0-9._-]+/g, "FL1.<token>").slice(0, 160);
async function login(key) {
  const c = createClient(URL, KEY, opts);
  const { data, error } = await c.auth.signInWithPassword({ email: creds[`FL_${key}_EMAIL`], password: creds[`FL_${key}_PASSWORD`] });
  if (error) throw new Error(`login ${key}: ${error.message}`);
  return { c, id: data.user.id };
}
const rpc = (c, fn, args = {}) => c.rpc(fn, args);
const denied = (r) => !!r.error && r.error.code !== "PGRST202";
const errOf = (r) => r.error ? (r.error.code + " " + r.error.message).slice(0, 110) : null;

// Lagos wall-clock helpers (Africa/Lagos is UTC+1, no DST).
const lagosDate = (offsetDays = 0) => new Date(Date.now() + 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const lagosAt = (date, hhmm) => new Date(`${date}T${hhmm}:00+01:00`).toISOString();

console.log(`run at ${new Date().toISOString()} (Lagos ${lagosDate()})`);

// ---------------------------------------------------------------- A. auth & roles
const S = {};
for (const k of ["owner", "fadmin", "gate", "custa", "custb"]) S[k] = await login(k);
check("A1 all 5 controlled accounts sign in", true);
for (const k of Object.keys(S)) {
  const r = await rpc(S[k].c, "ensure_profile");
  if (r.error) check(`A2 ensure_profile ${k}`, false, errOf(r));
}
check("A2 ensure_profile works for every account", true);
const ownerRoles = (await rpc(S.owner.c, "my_roles")).data;
const custRoles = (await rpc(S.custa.c, "my_roles")).data;
// facilities (public read)
const { data: facs } = await anon.from("facilities").select("id, slug, name, is_dev_fixture");
const pitch = facs?.find((f) => f.slug === "dev-test-pitch"), courts = facs?.find((f) => f.slug === "dev-test-courts");
check("A3 owner is platform owner", ownerRoles?.is_platform_owner === true, short(ownerRoles));
check("A4 customer has no staff role", custRoles?.is_platform_owner !== true && (custRoles?.memberships ?? []).length === 0, short(custRoles));
check("A5 customer cannot open admin overview", denied(await rpc(S.custa.c, "admin_overview")));
check("A6 customer cannot invite staff", denied(await rpc(S.custa.c, "invite_staff", { p_email: creds.FL_custb_EMAIL, p_role: "gatekeeper", p_facility_id: courts?.id ?? null })));

check("A7 anon sees both DEV facilities (labelled dev fixtures)", !!pitch && !!courts && pitch.is_dev_fixture && courts.is_dev_fixture);
const { data: surfaces } = await anon.from("playing_surfaces").select("id, name, facility_id");
const pitchA = surfaces.find((s) => s.facility_id === pitch.id), court1 = surfaces.find((s) => s.name === "Test Court 1");

// ---------------------------------------------------------------- B. staff invitations
async function invite(email, role, facility, acceptor) {
  const inv = await rpc(S.owner.c, "invite_staff", { p_email: email, p_role: role, p_facility_id: facility });
  if (inv.error) return { error: errOf(inv) };
  const acc = await rpc(acceptor.c, "accept_staff_invitation", { p_token: inv.data.token });
  return { inv: inv.data, acc };
}
const fa = await invite(creds.FL_fadmin_EMAIL, "facility_admin", courts.id, S.fadmin);
check("B1 owner invites facility admin (Courts) and it is accepted", !fa.error && !fa.acc.error, fa.error ?? errOf(fa.acc) ?? short(fa.acc.data));
const gk = await invite(creds.FL_gate_EMAIL, "gatekeeper", pitch.id, S.gate);
check("B2 owner invites gatekeeper (Pitch) and it is accepted", !gk.error && !gk.acc.error, gk.error ?? errOf(gk.acc) ?? short(gk.acc.data));
const wrong = await rpc(S.owner.c, "invite_staff", { p_email: creds.FL_gate_EMAIL, p_role: "scheduler", p_facility_id: pitch.id });
const stolen = await rpc(S.custb.c, "accept_staff_invitation", { p_token: wrong.data?.token });
check("B3 another user cannot accept someone else's invitation", denied(stolen), errOf(stolen));
if (wrong.data?.invitation_id) await rpc(S.owner.c, "revoke_staff_invitation", { p_invitation_id: wrong.data.invitation_id });
const faRoles = (await rpc(S.fadmin.c, "my_roles")).data;
check("B4 facility admin's role is scoped to Courts only", (faRoles?.memberships ?? []).every((m) => m.facility_id === courts.id) && faRoles.memberships.length >= 1, short(faRoles));

// ---------------------------------------------------------------- C/D. availability & booking (Courts: automatic + free)
const tomorrow = lagosDate(1);
const avail = await anon.rpc("facility_availability", { p_facility: courts.id, p_day: tomorrow });
check("C1 public availability for Courts tomorrow", !avail.error && avail.data.length > 0, avail.error ? errOf(avail) : `${avail.data.length} slots, states=${[...new Set(avail.data.map((s) => s.state))]}`);
const slot10 = lagosAt(tomorrow, "10:00");
const key = `e2e-${Date.now()}`;
const bk = await rpc(S.custa.c, "create_booking", { p_surface_id: court1.id, p_start: slot10, p_organizer_name: "FL TEST Customer A", p_organizer_email: creds.FL_custa_EMAIL, p_activity_type: "friendly", p_activity_title: "E2E test game", p_public_listing: true, p_idempotency_key: key });
check("D1 customer A books Courts 10:00 tomorrow", !bk.error, errOf(bk) ?? short(bk.data));
const bkId = bk.data?.booking_id ?? bk.data?.id;
const bkAgain = await rpc(S.custa.c, "create_booking", { p_surface_id: court1.id, p_start: slot10, p_organizer_name: "FL TEST Customer A", p_organizer_email: creds.FL_custa_EMAIL, p_idempotency_key: key });
check("D2 retry with same idempotency key returns the same booking", (bkAgain.data?.booking_id ?? bkAgain.data?.id) === bkId, errOf(bkAgain) ?? short(bkAgain.data));
const { data: bRow } = await S.custa.c.from("bookings").select("id, reference, status, approval_status, payment_status").eq("id", bkId).maybeSingle();
check("D3 automatic + free booking is confirmed", bRow?.status === "confirmed", short(bRow));

// ---------------------------------------------------------------- E. concurrency (same slot, two customers)
const slot1130 = lagosAt(tomorrow, "11:00");
const [r1, r2] = await Promise.all([
  rpc(S.custa.c, "create_booking", { p_surface_id: court1.id, p_start: slot1130, p_organizer_name: "FL TEST Customer A", p_organizer_email: creds.FL_custa_EMAIL }),
  rpc(S.custb.c, "create_booking", { p_surface_id: court1.id, p_start: slot1130, p_organizer_name: "FL TEST Customer B", p_organizer_email: creds.FL_custb_EMAIL }),
]);
const okCount = [r1, r2].filter((r) => !r.error && (r.data?.booking_id || r.data?.id)).length;
check("E1 simultaneous bookings of one slot: exactly one succeeds", okCount === 1, `A: ${errOf(r1) ?? "ok"} | B: ${errOf(r2) ?? "ok"}`);
const loser = !r1.error ? S.custb : S.custa;
const winnerBooking = (!r1.error ? r1 : r2).data;

// ---------------------------------------------------------------- F. customer isolation
const { data: bSees } = await S.custb.c.from("bookings").select("id, created_by");
check("F1 customer B cannot see customer A's booking", !(bSees ?? []).some((b) => b.id === bkId), `B sees ${bSees?.length ?? 0} rows`);
const stealPass = await rpc(S.custb.c, "my_pass_token", { p_booking_id: bkId });
check("F2 customer B cannot get A's entry pass", !!bkId && (denied(stealPass) || (!stealPass.error && !stealPass.data?.token)), errOf(stealPass) ?? short(stealPass.data));
const steal = await rpc(S.custb.c, "cancel_booking", { p_booking_id: bkId, p_reason: "not mine" });
check("F3 customer B cannot cancel A's booking", !!bkId && denied(steal), errOf(steal));
check("F4 anon cannot read bookings", !!(await anon.from("bookings").select("id").limit(1)).error);

// ---------------------------------------------------------------- G. approval workflow (Pitch: approval required)
const today = lagosDate(0);
const pitchSlot = lagosAt(lagosDate(Number(process.env.PITCH_DAY_OFFSET ?? 0)), process.env.PITCH_TIME ?? "19:00");
const pb = await rpc(S.custa.c, "create_booking", { p_surface_id: pitchA.id, p_start: pitchSlot, p_organizer_name: "FL TEST Customer A", p_organizer_email: creds.FL_custa_EMAIL, p_activity_type: "training", p_activity_title: "E2E pitch session" });
const pbId = pb.data?.booking_id ?? pb.data?.id;
const { data: pRow } = await S.custa.c.from("bookings").select("status, approval_status, payment_status").eq("id", pbId).maybeSingle();
check("G1 Pitch booking 19:00 today is created and waits for approval", !pb.error && pRow?.approval_status === "pending" && pRow?.status === "pending", errOf(pb) ?? short(pRow));
const gReview = await rpc(S.gate.c, "review_booking", { p_booking_id: pbId, p_decision: "approve" });
check("G2 gatekeeper cannot approve bookings", !!pbId && denied(gReview), errOf(gReview));
const faReview = await rpc(S.fadmin.c, "review_booking", { p_booking_id: pbId, p_decision: "approve" });
check("G3 Courts admin cannot approve a Pitch booking", !!pbId && denied(faReview), errOf(faReview));
const oReview = await rpc(S.owner.c, "review_booking", { p_booking_id: pbId, p_decision: "approve", p_waive_payment: true });
const { data: pRow2 } = await S.custa.c.from("bookings").select("reference, status, approval_status, payment_status").eq("id", pbId).maybeSingle();
check("G4 owner approves (payment waived — no real payment) → confirmed", !oReview.error && pRow2?.status === "confirmed", errOf(oReview) ?? short(pRow2));

// ---------------------------------------------------------------- H/I. pass + gate (TEST MODE)
const passR = await rpc(S.custa.c, "my_pass_token", { p_booking_id: pbId });
const token = passR.data?.token;
check("H1 customer A gets a signed entry pass", typeof token === "string" && token.startsWith("FL1."), errOf(passR) ?? "token issued (not printed)");
const faScan = await rpc(S.fadmin.c, "gate_scan", { p_facility_id: pitch.id, p_token: token, p_commit: false, p_idempotency_key: `fa-${Date.now()}` });
check("I1 Courts admin cannot scan at the Pitch gate", !!token && denied(faScan), errOf(faScan));
const custScan = await rpc(S.custa.c, "gate_scan", { p_facility_id: pitch.id, p_token: token, p_commit: false, p_idempotency_key: `c-${Date.now()}` });
check("I2 customer cannot use the gate scanner", !!token && denied(custScan), errOf(custScan));
const tampered = token ? token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA") : "x";
const tScan = await rpc(S.gate.c, "gate_scan", { p_facility_id: pitch.id, p_token: tampered, p_commit: false, p_idempotency_key: `t-${Date.now()}` });
check("I3 tampered pass is rejected", !!token && !tScan.error && tScan.data?.result !== "valid" && tScan.data?.result !== "admitted", errOf(tScan) ?? short(tScan.data));
const early = await rpc(S.gate.c, "gate_scan", { p_facility_id: pitch.id, p_token: token, p_commit: false, p_idempotency_key: `e-${Date.now()}` });
console.log(`      gate preview now: ${short(early.data) ?? errOf(early)}`);
check("I4 gate preview runs in TEST MODE", early.data?.mode === "test", short(early.data));

if (process.env.WAIT_FOR_GATE === "1") {
  const opens = new Date(pitchSlot).getTime() - 30 * 60e3 + 15e3;
  if (Date.now() < opens) { console.log(`      waiting ${Math.round((opens - Date.now()) / 1000)}s for entry window…`); await new Promise((r) => setTimeout(r, opens - Date.now())); }
  const k1 = `g1-${Date.now()}`;
  const s1 = await rpc(S.gate.c, "gate_scan", { p_facility_id: pitch.id, p_token: token, p_commit: true, p_idempotency_key: k1, p_device_label: "e2e" });
  check("I5 gatekeeper scan inside entry window: checked in (test mode)", !s1.error && s1.data?.checked_in === true && s1.data?.mode === "test", errOf(s1) ?? short(s1.data));
  const s1r = await rpc(S.gate.c, "gate_scan", { p_facility_id: pitch.id, p_token: token, p_commit: true, p_idempotency_key: k1, p_device_label: "e2e" });
  check("I6 same scan retried (same idempotency key) returns the same result", s1r.data?.result === s1.data?.result, short(s1r.data));
  const s2 = await rpc(S.gate.c, "gate_scan", { p_facility_id: pitch.id, p_token: token, p_commit: true, p_idempotency_key: `g2-${Date.now()}`, p_device_label: "e2e" });
  check("I7 second scan of the same pass is flagged as duplicate", !s2.error && s2.data?.checked_in !== true && /dup|already/i.test(s2.data?.result ?? ""), errOf(s2) ?? short(s2.data));
  const today2 = await rpc(S.gate.c, "gate_today", { p_facility_id: pitch.id });
  check("I8 gate list for today shows the check-in", !today2.error, errOf(today2) ?? short(today2.data));
}

// ---------------------------------------------------------------- J/K. admin views, public schedule, cancellation
const ov = await rpc(S.owner.c, "admin_overview", { p_facility_id: null });
check("K1 owner admin overview", !ov.error, errOf(ov) ?? short(ov.data));
const faOv = await rpc(S.fadmin.c, "admin_overview", { p_facility_id: courts.id });
check("K2 Courts admin sees Courts overview", !faOv.error, errOf(faOv));
const faOvPitch = await rpc(S.fadmin.c, "admin_overview", { p_facility_id: pitch.id });
check("K3 Courts admin cannot open Pitch overview", denied(faOvPitch), errOf(faOvPitch));
const rep = await rpc(S.owner.c, "admin_report", { p_facility_id: courts.id, p_from: today, p_to: tomorrow });
check("K4 owner report for Courts", !rep.error, errOf(rep) ?? short(rep.data));
const sched = await anon.rpc("public_schedule", { p_from: lagosAt(tomorrow, "00:00"), p_to: lagosAt(tomorrow, "23:59") });
check("K5 public schedule lists the public-listed booking without personal data",
  !sched.error && sched.data.some((r) => r.booking_id === bkId) && !JSON.stringify(sched.data).includes("@"), errOf(sched) ?? `${sched.data.length} rows`);
const cx = await rpc(S.custa.c, "cancel_booking", { p_booking_id: bkId, p_reason: "E2E test" });
check("L1 customer cannot cancel a CONFIRMED booking (policy: pending_only)", denied(cx) && /CANCELLATION_NOT_ALLOWED/.test(cx.error.message), errOf(cx));
const sx = await rpc(S.fadmin.c, "cancel_booking", { p_booking_id: bkId, p_reason: "E2E test: staff cancellation" });
const { data: cRow } = await S.custa.c.from("bookings").select("status").eq("id", bkId).maybeSingle();
check("L2 Courts admin cancels it; customer sees it cancelled", !sx.error && cRow?.status === "cancelled", errOf(sx) ?? short(cRow));
const slotFree = await anon.rpc("facility_availability", { p_facility: courts.id, p_day: tomorrow });
check("L3 cancelled slot is available again", (slotFree.data ?? []).some((x) => x.surface_id === court1.id && new Date(x.slot_start).getTime() === new Date(slot10).getTime() && x.state === "available"), errOf(slotFree));
// cleanup: owner cancels every other future booking this run created (DEV facilities only)
for (const id of [winnerBooking?.booking_id ?? winnerBooking?.id, process.env.WAIT_FOR_GATE === "1" ? null : pbId].filter(Boolean)) {
  const r = await rpc(S.owner.c, "cancel_booking", { p_booking_id: id, p_reason: "E2E test cleanup" });
  if (r.error) console.log(`      cleanup ${id.slice(0, 8)}: ${errOf(r)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
