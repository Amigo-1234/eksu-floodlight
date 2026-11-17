# Customer registration — enablement runbook

Floodlight's sign-up, sign-in, sign-out, profile and session handling are
implemented for **both** Auth modes, and the pages read the shared project's
live settings (GoTrue `/auth/v1/settings`, cached 5 minutes):

| Shared Auth setting | What `/sign-up` does |
| --- | --- |
| Sign-ups off | "Registration isn't switched on yet" + disabled form |
| Sign-ups on, **Confirm email OFF** (approved for now) | creates the account, signs the user in immediately, ensures their Floodlight profile, redirects to `/dashboard?welcome=1` ("Welcome to Floodlight!") — no "check your email" screen |
| Sign-ups on, Confirm email ON (later, with SMTP) | "Check your email" + resend, then `/auth/callback` → dashboard |

## Owner action required now (Supabase Dashboard, project `lkvdoeomyhbtinpvvbfr`)

These are project-wide switches that this session could not change (no
Management API access from the build environment):

1. **Authentication → Sign In / Providers → Email**: keep *Email provider* ON, turn **Confirm email OFF**.
2. **Authentication → Sign In / Providers**: turn **Allow new users to sign up ON**.
3. Within 5 minutes `/sign-up` switches to the live form (no redeploy needed).

With *Confirm email* off, GoTrue auto-confirms new users (it sets
`auth.users.email_confirmed_at` at sign-up). Floodlight's booking guard
(`0009_customer_safeguards`, `EMAIL_NOT_VERIFIED`) therefore stays in place
unchanged and simply passes for these users; nothing in the database was
weakened. Booking itself remains limited by the existing launch controls
(pre-launch test mode, approved testers only, staff approval, no online
payments, gate admission in test mode).

### What still needs email (SMTP) later

* **Password reset** — `/forgot-password` warns that reset emails may not arrive
  until `EMAIL_DELIVERY_READY=true` is set on Vercel (do that after SMTP works).
* **Staff invitations** — already delivered as a copyable single-use link in
  Admin → Staff; no email needed.
* **Email verification** — turn *Confirm email* back on once SMTP is live.

## Background: why the switches are shared

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
