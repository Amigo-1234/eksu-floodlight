# EKSU Floodlight

**EKSU Sports Facility Booking & Management** — _Your Field. Your Time. Your Game._

A booking and field-access platform built for the sports community of Ekiti State University (EKSU), Ado-Ekiti.
It is independent of EKSU Sports Hub and is **not presented as an official EKSU service** until the university
confirms authorization. No EKSU logo or protected brand asset is used.

## What it does

| Area | Routes |
| --- | --- |
| Public | `/`, `/facilities`, `/facilities/[slug]`, `/schedule`, `/policies`, `/sign-in`, `/sign-up` |
| Booking | `/book/[facilityId]` (date → time → details → review), `/booking/confirmation/[id]` |
| Customer | `/dashboard`, `/dashboard/bookings`, `/dashboard/bookings/[id]`, `/dashboard/profile` |
| Admin (light theme) | `/admin`, `/admin/bookings` (+ `/new`, `/[id]`), `/admin/facilities` (+ `/[id]`), `/admin/availability`, `/admin/check-ins`, `/admin/payments`, `/admin/reports`, `/admin/staff`, `/admin/settings` |
| Gate | `/gate`, `/gate/scan`, `/gate/history` |
| Staff onboarding | `/invite/[token]` (invitation only — there is no public admin sign-up) |
| API | `POST /api/payments/paystack/webhook` (disabled until configured) |

## Guarantees (enforced in Postgres, not the browser)

- **No double bookings.** `bookings_no_overlap` is a GiST exclusion constraint on `(surface_id, period)` for every
  slot-holding status. Customer, staff, walk-in and reschedule paths all hit it; holds and blocks are serialized
  with a per-surface advisory lock.
- **Separate statuses.** Booking, approval and payment status are separate columns; gate access is separate again
  (credentials + check-ins). A booking is `confirmed` only when approval is not required/approved **and** payment is
  not required, paid, or explicitly waived by a facility admin (audited). An unconfigured payment policy never
  confirms a booking.
- **Unforgeable passes.** QR content is `FL1.<credential>.<version>.<HMAC-SHA256>`; the signing key lives in
  `private.app_secrets` (no API role can read it). Every scan is validated against the live booking, logged, and
  check-ins are atomic (one per booking per mode). Live admission is **off** (test mode) until approved.
- **Least privilege.** RLS on every table; all writes to bookings/payments/credentials go through checked
  `SECURITY DEFINER` functions. Roles: platform owner (global) and facility-scoped facility admin / scheduler /
  gatekeeper. Staff MFA can be required platform-wide (`require_staff_mfa`).

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + publishable key
```

Database (Supabase project or `supabase start` with Docker):

```bash
npx supabase link --project-ref <ref>
npx supabase db push                     # applies supabase/migrations
# Development only, never production:
psql "$DEV_DATABASE_URL" -f supabase/dev-fixtures.sql
# First platform owner (after that person has signed up), from the SQL editor:
select private.bootstrap_platform_owner('owner@example.com');
```

Then `npm run dev`.

## Tests

```bash
npm run typecheck
npm run lint
# Database tests need a DISPOSABLE PostgreSQL 15+ (the harness creates and drops its own database):
FLOODLIGHT_TEST_PG=postgres://postgres@127.0.0.1:54329/postgres npm run test:db
```

`tests/db` runs the real migrations on plain PostgreSQL through a small auth shim
(`supabase/tests/shim/supabase_shim.sql`) and covers concurrency (40 simultaneous bookings, 12 simultaneous scans),
RLS, staff scoping, approval/payment rules, gate verification, payments idempotency, invitations and MFA gating.

## Unresolved client decisions (deliberately not assumed)

These are configurable and **unset** by default: facility list and details, slot length and opening hours,
booking eligibility, pricing, payment policy (free / online / offline / hybrid / deposit), cancellation and
reschedule rules, the gate-entry policy (organiser pass vs per-player passes) and live admission, notification
provider and templates, official contact details, and EKSU endorsement/branding. See
`/admin/facilities/[id]` and `/admin/settings`.
