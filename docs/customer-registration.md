# Customer registration — enablement runbook

Floodlight's sign-up, email verification, sign-in, forgot/reset password and
sign-out flows are implemented and unit-tested. **Public sign-ups are still
switched off in the shared Supabase Auth project** (`lkvdoeomyhbtinpvvbfr`,
shared with EKSU Sports Hub), so `/sign-up` currently shows "New accounts open
soon" (the page reads GoTrue's public `/auth/v1/settings` every 5 minutes and
turns the form on by itself once sign-ups are allowed).

Status checked on 2026-11-16 (live auth logs): a sign-up from
`eksu-floodlight.vercel.app` was rejected with `422 signup_disabled`.

## Why it is not simply switched on

1. **"Allow new users to sign up" is project-wide.** Turning it on also lets
   anyone create an account against EKSU Sports Hub's auth. Hiding a button in
   Sports Hub does not prevent this (the Auth API is public).
2. **Email delivery.** Supabase's built-in email service only delivers to
   members of the Supabase organisation and is heavily rate-limited. Real
   students would never receive their verification or reset emails. A custom
   SMTP provider is required first.

## Sports Hub safety — verified live on 2026-11-16

A self-registered user gets **no Sports Hub privileges**:

| Check | Result |
| --- | --- |
| `on_auth_user_created` → `private.handle_new_user()` | inserts `public.profiles(id, display_name)` only — no role |
| `public.user_roles`, `public.operator_assignments`, `public.roles` | RLS on; **no** INSERT/UPDATE/DELETE grant to `authenticated` |
| `public.profiles` | `authenticated` may UPDATE `display_name` only (column grant) on its own row |
| `admin_grant_role`, `admin_revoke_role`, `admin_set_staff_active`, `admin_assign_operators`, `admin_list_staff` | all call `private.require_admin()` first |
| `operator_match_state` | requires `private.is_staff()` + an active assignment |
| Staff-list privacy patch (`db/sports-hub-patches/0001`) | **active**: `admin_list_staff` returns only users with a role, a deactivation, or a ROLE_GRANTED audit entry |
| Floodlight roles | staff roles exist only via `invite_staff` → `accept_staff_invitation` (invitation-only); `my_roles` for a new user is empty |

## What the owner must do (in this order)

1. **Custom SMTP** — Dashboard → Project Settings → Authentication → SMTP Settings → *Enable custom SMTP*.
   Use a transactional provider you control (e.g. Resend, Postmark, Brevo, Amazon SES, Mailgun):

   | Field | Value |
   | --- | --- |
   | Sender email | an address on a domain you verified with the provider, e.g. `no-reply@<your-domain>` |
   | Sender name | `EKSU Floodlight` (or a neutral name if Sports Hub shares the templates) |
   | Host / Port | from the provider (typically port `587`, STARTTLS) |
   | Username / Password | the provider's SMTP credentials (never commit or paste them anywhere else) |

   Add the provider's SPF/DKIM DNS records for the sender domain, then raise
   *Rate Limits → Emails sent per hour* (default with custom SMTP: 30) to suit.
2. **Redirect URLs** — Authentication → URL Configuration → *Redirect URLs* must contain
   `https://eksu-floodlight.vercel.app/**` (Floodlight sends `emailRedirectTo`/`redirectTo` =
   `https://eksu-floodlight.vercel.app/auth/callback?next=…`). Leave *Site URL* as Sports Hub's.
3. **Email templates** — the templates are shared. Keep `{{ .ConfirmationURL }}` in *Confirm signup*
   and *Reset password* so each link returns to the app that requested it (`/auth/callback`
   handles both the PKCE `code` and `token_hash` forms). Avoid Floodlight-only wording if Sports Hub
   staff also receive these emails.
4. **Keep "Confirm email" ON** (Authentication → Providers → Email). Floodlight also blocks booking for
   unverified addresses in the database (`0009_customer_safeguards`).
5. **Allow new users to sign up** — Authentication → Sign In / Providers → turn on. Within 5 minutes
   `/sign-up` switches from "open soon" to the live form.
6. Optional hardening: enable *Leaked password protection* and CAPTCHA (Turnstile/hCaptcha) on sign-up.

## Acceptance test after enabling (real backend)

New address → `/sign-up` → email arrives → link opens `/auth/callback` → lands on `/dashboard?welcome=1`
→ book a session (test mode) → sign out → sign in again. Also: register the same address twice
(shows "An account already exists…"), wrong password ("Incorrect email or password."), an old/used
link (`/sign-in?error=expired|link`), `/forgot-password` → reset email → `/reset-password`, booking
attempt before verifying (refused by the database), customer opening `/admin` (redirected), customer
opening another customer's `/dashboard/bookings/<id>` (404 via RLS).
