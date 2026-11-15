# Intentionally empty — do not add Floodlight migrations here.

EKSU Floodlight shares a Supabase project with EKSU Sports Hub. Sports Hub owns
this project's Supabase CLI migration history (`supabase_migrations.schema_migrations`).
Anything placed here and pushed with `supabase db push` / `apply_migration`
would be recorded in that shared history and break Sports Hub's deployments.

Floodlight's SQL lives in `db/migrations/` and is applied as one bundle
(`npm run db:bundle` → `db/dist/floodlight_bundle.sql`) that records versions in
Floodlight's own ledger `floodlight_private.schema_migrations`. See `db/README.md`.
