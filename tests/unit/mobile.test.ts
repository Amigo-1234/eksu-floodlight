import { test } from "node:test";
import assert from "node:assert/strict";
import { activeTab, nextNavState, NAV_SCROLL } from "../../src/lib/nav-scroll.ts";
import { paymentChip, ticketKind } from "../../src/lib/status.ts";
import { isExistingAccountResponse, PASSWORD_RULES } from "../../src/lib/auth-rules.ts";

type S = { visible: boolean; lastY: number; travel: number };
const run = (ys: number[], maxY = 3000, start: S = { visible: true, lastY: 0, travel: 0 }) =>
  ys.reduce((s, y) => nextNavState(s, y, maxY), start);

test("bottom bar hides after a deliberate scroll down and returns on scroll up", () => {
  const down = run([100, 130, 160, 200]);
  assert.equal(down.visible, false);
  const up = run([190, 180, 170], 3000, down);
  assert.equal(up.visible, true);
});

test("small back-and-forth movements never toggle the bar (jitter threshold)", () => {
  let s: S = { visible: true, lastY: 500, travel: 0 };
  for (let i = 0; i < 20; i++) s = run([510, 500], 3000, s);
  assert.equal(s.visible, true);
  s = run([500 + NAV_SCROLL.hideAfter - 1], 3000, s);
  assert.equal(s.visible, true, "just under the threshold stays visible");
});

test("bar is always visible near the top and at the end of the page", () => {
  const hidden: S = { visible: false, lastY: 800, travel: 0 };
  assert.equal(nextNavState(hidden, 10, 3000).visible, true);
  assert.equal(nextNavState(hidden, 2990, 3000).visible, true);
});

test("iOS overscroll bounce (negative / past-the-end scrollY) is ignored", () => {
  const hidden: S = { visible: false, lastY: 1500, travel: 0 };
  assert.equal(nextNavState(hidden, -40, 3000).visible, true); // clamped to top → visible, no throw
  const atEnd = nextNavState({ visible: true, lastY: 2900, travel: 0 }, 3080, 3000);
  assert.equal(atEnd.lastY, 3000);
});

test("exactly one customer tab is active per route", () => {
  assert.equal(activeTab("/dashboard"), "/dashboard");
  assert.equal(activeTab("/dashboard/bookings"), "/dashboard/bookings");
  assert.equal(activeTab("/dashboard/bookings/abc"), "/dashboard/bookings");
  assert.equal(activeTab("/booking/confirmation/abc"), "/dashboard/bookings");
  assert.equal(activeTab("/dashboard/profile"), "/dashboard/profile");
  assert.equal(activeTab("/book/xyz"), "/facilities");
  assert.equal(activeTab("/facilities/eksu-main-field"), "/facilities");
  assert.equal(activeTab("/invite/t"), null);
});

test("ticket variants: pending request, confirmed receipt, entry pass", () => {
  assert.equal(ticketKind("pending", false), "request");
  assert.equal(ticketKind("pending", true), "request", "a pass never shows on an unconfirmed booking");
  assert.equal(ticketKind("confirmed", false), "receipt");
  assert.equal(ticketKind("confirmed", true), "pass");
  assert.equal(ticketKind("cancelled", true), "request");
});

test("payment chip never says Paid unless the database says paid", () => {
  for (const s of ["not_required", "unconfigured", "pending", "waived", "failed", "refunded", "partially_refunded"] as const) {
    assert.notEqual(paymentChip(s, false).label, "Paid", s);
    assert.notEqual(paymentChip(s, false).tone, "ok", s);
  }
  assert.deepEqual(paymentChip("paid", false), { label: "Paid", tone: "ok" });
  assert.match(paymentChip("waived", true).label, /^Test/);
  assert.match(paymentChip("unconfigured", false).label, /Unpaid/);
});

test("password checklist matches the sign-up schema rules", () => {
  const pass = (v: string) => PASSWORD_RULES.every((r) => r.test(v));
  assert.ok(pass("floodlight7"));
  assert.ok(!pass("short1"));
  assert.ok(!pass("nonumbers"));
  assert.ok(!pass("12345678"));
  assert.ok(!pass("a1".repeat(40)), "over 72 chars is rejected (bcrypt limit)");
});

test("duplicate sign-up (obfuscated user with no identities) is detected", () => {
  assert.equal(isExistingAccountResponse({ identities: [] }), true);
  assert.equal(isExistingAccountResponse({ identities: [{ id: "x" }] }), false);
  assert.equal(isExistingAccountResponse(null), false);
  assert.equal(isExistingAccountResponse({}), false);
});

import { resolveTheme, THEME_BOOT_SCRIPT, THEME_KEY } from "../../src/lib/theme.ts";

test("theme preference resolves light / dark / system", () => {
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("dark", true), "dark");
  assert.equal(resolveTheme("system", true), "light");
  assert.equal(resolveTheme(null, false), "dark");
  assert.equal(resolveTheme("garbage", true), "light");
});

test("theme boot script applies the stored theme before paint", () => {
  const attrs: Record<string, string> = {};
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, localStorage: g.localStorage, matchMedia: g.matchMedia };
  g.document = { documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } } };
  g.localStorage = { getItem: (k: string) => (k === THEME_KEY ? "light" : null) };
  g.matchMedia = () => ({ matches: false });
  try {
    new Function(THEME_BOOT_SCRIPT)();
    assert.equal(attrs["data-theme"], "light");
    assert.equal(attrs["data-theme-pref"], "light");
    g.localStorage = { getItem: () => { throw new Error("blocked"); } };
    new Function(THEME_BOOT_SCRIPT)();
    assert.equal(attrs["data-theme"], "dark", "storage blocked → system (dark here), no crash");
    assert.equal(attrs["data-theme-pref"], "system");
  } finally {
    Object.assign(g, saved);
  }
});
