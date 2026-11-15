-- pgTAP checks for db/sports-hub-patches/0001_admin_list_staff_staff_only.sql
-- (run inside a transaction on a LOCAL Sports Hub + Floodlight database).
begin;
\ir helpers.inc
select plan(7);
create temp table u as select
  tests.make_user('fl-customer@test.local') as customer,
  tests.make_user('op-current@test.local', array['OPERATOR']) as op,
  tests.make_user('admin-x@test.local', array['ADMIN']) as admin,
  tests.make_user('op-revoked@test.local') as revoked,
  tests.make_user('op-deactivated@test.local', array['OPERATOR']) as deact;
grant select on u to anon, authenticated;
-- revoked: granted then revoked through the real admin functions (audited)
select tests.login((select admin from u));
select public.admin_grant_role((select revoked from u), 'OPERATOR');
select public.admin_revoke_role((select revoked from u), 'OPERATOR');
select public.admin_set_staff_active((select deact from u), false);
create temp table listed as select user_id from public.admin_list_staff();
reset role;
select ok(not exists (select 1 from listed where user_id = (select customer from u)), 'Floodlight-only account (never had a Sports Hub role) is not listed');
select ok(exists (select 1 from listed where user_id = (select op from u)), 'current operator listed');
select ok(exists (select 1 from listed where user_id = (select admin from u)), 'admin listed');
select ok(exists (select 1 from listed where user_id = (select revoked from u)), 'staff whose roles were revoked are still listed (can be re-granted)');
select ok(exists (select 1 from listed where user_id = (select deact from u)), 'deactivated staff listed (can be reactivated)');
select tests.login((select op from u));
select throws_ok('select * from public.admin_list_staff()', 'EK403', 'Administrator access required', 'non-admins still refused');
reset role;
select is((select count(*)::int from information_schema.routine_privileges where routine_schema='public' and routine_name='admin_list_staff' and grantee in ('authenticated','service_role')), 2, 'grants unchanged');
select * from finish();
rollback;
