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

1. Back up and prove the backup restores (read-only against live; the
   connection file `~/.eksu/sports-hub-db.env` is chmod 600 and never printed):
   ```bash
   scripts/backup-sports-hub.sh                      # → ~/Documents/eksu-backups/<UTC>/ (chmod 700)
   RESTORE_PGDATA=<scratch dir> scripts/verify-sports-hub-backup.sh <BACKUP_DIR>
   RESTORE_PGDATA=<scratch dir> scripts/verify-sports-hub-backup-suite.sh <BACKUP_DIR>
   ```
   The first verifier restores everything into an isolated local PostgreSQL 17
   and compares every table with live (rows and content checksums). The second
   restores the backed-up schema with Sports Hub's own seed and runs its 924
   pgTAP assertions. (The suite needs the dev seed's fixed-UUID fixtures, which
   production data doesn't contain.)

   **Restore pitfalls (also apply to a real recovery):**
   - `pg_dump` stores table privileges only as GRANTs on top of built-in
     defaults. Before restoring into a schema with Supabase's default
     privileges, run `alter default privileges in schema public revoke all on
     tables/sequences/functions from anon, authenticated, service_role`.
     Otherwise `anon`/`authenticated` end up with ALL on every restored table.
   - `app.dump` doesn't contain Sports Hub's objects on platform tables: the
     `on_auth_user_created` trigger on `auth.users` and its policies on
     `storage.objects` and `realtime.messages`. The verifier recreates them from
     their live definitions (`restore-platform-objects.sql` in the backup folder).
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
