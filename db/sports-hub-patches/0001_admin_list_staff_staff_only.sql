-- PROPOSED PATCH FOR EKSU SPORTS HUB — NOT APPLIED. Requires separate approval.
--
-- Problem: public.admin_list_staff() lists EVERY account in the shared auth
-- service (profiles join auth.users), so EKSU Floodlight customers would
-- appear, with their email addresses, in Sports Hub's admin staff screen.
--
-- Change: same signature, same columns, same ADMIN check, same ordering; one
-- added WHERE clause. A person is listed if they are, or ever were, Sports Hub
-- staff:
--   * holds a Sports Hub role now (public.user_roles), or
--   * is a deactivated staff member (profiles.deactivated_at is not null;
--     deactivation keeps roles, so this is belt-and-braces), or
--   * was ever granted a role (append-only public.audit_log 'ROLE_GRANTED'),
--     so staff whose roles were all revoked can still be re-granted.
-- Accounts that never had a Sports Hub role (e.g. Floodlight-only customers)
-- are no longer listed. Nothing else in Sports Hub reads this list.
create or replace function public.admin_list_staff()
 returns table(user_id uuid, email text, display_name text, roles text[], deactivated_at timestamp with time zone,
               created_at timestamp with time zone, last_sign_in_at timestamp with time zone, email_confirmed boolean,
               active_assignments bigint)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
begin
  perform private.require_admin();
  return query
  select p.id, u.email::text, p.display_name,
    coalesce(array_agg(distinct r.code) filter (where r.code is not null), '{}'),
    p.deactivated_at, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
    (select count(*) from public.operator_assignments a where a.user_id = p.id and a.active)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_roles ur on ur.user_id = p.id
  left join public.roles r on r.id = ur.role_id
  where exists (select 1 from public.user_roles x where x.user_id = p.id)
     or p.deactivated_at is not null
     or exists (select 1 from public.audit_log l
                where l.action = 'ROLE_GRANTED' and l.entity_type = 'profile' and l.entity_id = p.id)
  group by p.id, u.id
  order by p.display_name;
end $function$;
