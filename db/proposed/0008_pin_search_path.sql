-- PROPOSED (not applied): EKSU Floodlight 0008 — pin search_path on three
-- internal functions flagged by the Supabase advisor
-- "function_search_path_mutable" after 0001–0007 were applied on 2026-11-15.
--
-- Risk of the current state is low: none of the three is SECURITY DEFINER,
-- anon/authenticated cannot execute them, they live in the unexposed
-- floodlight_private schema, and their bodies reference no tables (only
-- now(), NEW, TG_TABLE_NAME and their arguments). Pinning search_path to ''
-- clears the warning without changing behaviour (now() resolves from
-- pg_catalog, which is always searched).
--
-- Touches only floodlight_private. Requires separate approval.
alter function floodlight_private.touch_updated_at() set search_path = '';
alter function floodlight_private.forbid_change() set search_path = '';
do $$
declare v_sig text;
begin
  select p.oid::regprocedure::text into v_sig
  from pg_proc p where p.pronamespace = 'floodlight_private'::regnamespace and p.proname = 'initial_statuses';
  execute format('alter function %s set search_path = %L', v_sig, '');
end $$;
