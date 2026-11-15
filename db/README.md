# Floodlight database — shared-project runbook

EKSU Floodlight runs inside the existing EKSU Sports Hub Supabase project
(`lkvdoeomyhbtinpvvbfr`, eu-west-2) **only after explicit approval**. This file
lists exactly what would change and how to undo it.

## What Floodlight adds

| Area | Change | Effect on Sports Hub |
| --- | --- | --- |
| Schemas | `floodlight` (Data API), `floodlight_private` (internal) | None — new names, no grants to/from existing schemas |
| Extension | `btree_gist` in `extensions` (188 operator functions) | None — additive; Sports Hub does not use it |
| Storage | bucket `floodlight-facility-images` + 3 policies `floodlight_facility_images_*` on `storage.objects`, each `CASE bucket_id …` so they are FALSE (never error) for any other bucket | None — `registration-documents` behaviour unchanged (tested) |
| pg_cron | job `floodlight-housekeeping` every 5 min (pg_cron already installed) | One more cron job; runs only `floodlight_private.run_booking_housekeeping()` |
| Data API | add `floodlight` to *Exposed schemas* (Dashboard → Project Settings → Data API) | None — `public` / `graphql_public` stay exposed exactly as now |
| Auth | add `https://eksu-floodlight.vercel.app/**` to *Redirect URLs* | None — Site URL unchanged |
| Migration history | **not** written: Floodlight records versions in `floodlight_private.schema_migrations` | Sports Hub's `supabase db push` keeps working |

Nothing is created, replaced, granted or revoked in `public`, `private`, `auth`
or `realtime`. No trigger is added to `auth.users`.

## Rehearsal (local, required before any remote change)

```bash
# disposable local PostgreSQL 15+ (never a remote project)
export PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres
npm run test:sports-hub-regression      # Sports Hub's own 924 pgTAP assertions before/after + catalog diff
FLOODLIGHT_TEST_PG=postgres://postgres@127.0.0.1:54329/postgres npm run test:coexist   # Floodlight + isolation tests on top of Sports Hub
```

## Applying remotely (after approval only)

1. Back up: confirm a recent automatic backup exists (Dashboard → Database →
   Backups). On the free plan, also take a logical dump of `public`,
   `private`, `storage` metadata and `auth` (`supabase db dump`) and store it
   outside the repo.
2. `npm run db:bundle` → apply `db/dist/floodlight_bundle.sql` as ONE
   transaction (SQL editor, or the MCP `execute_sql` tool) — **not**
   `supabase db push` and **not** `apply_migration`.
3. Dashboard → Data API → add `floodlight` to Exposed schemas.
4. Dashboard → Authentication → URL Configuration → add the Floodlight
   redirect URL. Decide on sign-ups (see the audit: Sports Hub may have public
   sign-ups disabled).
5. Verify: `select * from floodlight_private.schema_migrations;` shows 7 rows;
   run Supabase security advisors; smoke-test Sports Hub (login, public
   scores, admin, operator console).

## Rollback

`db/rollback.sql` removes everything Floodlight created except the
`btree_gist` extension (harmless, kept on purpose) and storage *objects*
(empty the bucket in the Dashboard first). Rehearsed locally: after rollback
the catalog matches the original apart from `btree_gist`.

## Development fixtures

`db/dev-fixtures.sql` inserts two clearly labelled DEV facilities
(`is_dev_fixture = true`). Never run it against production data you intend to
keep; remove with `delete from floodlight.facilities where is_dev_fixture;`.
