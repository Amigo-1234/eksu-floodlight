-- Fingerprint of every database object OUTSIDE Floodlight's schemas, used to
-- prove that applying Floodlight changes nothing that belongs to Sports Hub or
-- the platform. One row per object: kind, name, md5 of its definition + ACL.
select * from (
  select 'schema' kind, n.nspname name, md5(coalesce(array_to_string(n.nspacl, ','), '') || pg_get_userbyid(n.nspowner)) def
  from pg_namespace n
  union all
  select 'relation', n.nspname || '.' || c.relname,
         md5(c.relkind::text || c.relrowsecurity || c.relforcerowsecurity || coalesce(array_to_string(c.relacl, ','), ''))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  union all
  select 'column', table_schema || '.' || table_name || '.' || column_name,
         md5(data_type || is_nullable || coalesce(column_default, ''))
  from information_schema.columns
  union all
  select 'column_acl', table_schema || '.' || table_name || '.' || column_name, md5(string_agg(grantee || privilege_type, ',' order by grantee, privilege_type))
  from information_schema.column_privileges group by 1, 2
  union all
  select 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         md5(pg_get_functiondef(p.oid) || coalesce(array_to_string(p.proacl, ','), ''))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.prokind in ('f', 'p')
  union all
  select 'policy', schemaname || '.' || tablename || '.' || policyname,
         md5(cmd || array_to_string(roles, ',') || coalesce(qual, '') || coalesce(with_check, '') || permissive)
  from pg_policies
  union all
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal
  union all
  select 'constraint', n.nspname || '.' || con.conname, md5(pg_get_constraintdef(con.oid))
  from pg_constraint con join pg_namespace n on n.oid = con.connamespace
  union all
  select 'type', n.nspname || '.' || t.typname, md5(t.typtype::text || coalesce(array_to_string(t.typacl, ','), ''))
  from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typtype in ('e', 'd', 'c') and t.typrelid = 0 or t.typtype = 'e'
  union all
  select 'default_acl', pg_get_userbyid(d.defaclrole) || ':' || coalesce(n.nspname, '*') || ':' || d.defaclobjtype::text,
         md5(array_to_string(d.defaclacl, ','))
  from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
  union all
  select 'extension', extname, md5(extversion) from pg_extension
  union all
  select 'role', rolname, md5(rolsuper::text || rolinherit || rolcanlogin || rolbypassrls || coalesce(array_to_string(rolconfig, ','), ''))
  from pg_roles
  union all
  select 'bucket', 'storage.buckets.' || id, md5(public::text || coalesce(file_size_limit, 0)::text || coalesce(array_to_string(allowed_mime_types, ','), ''))
  from storage.buckets
  union all
  select 'cron_job', 'cron.job.' || jobname, md5(schedule || command) from cron.job
  union all
  select 'row_count', n.nspname || '.' || c.relname,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private', 'auth', 'storage') and c.relkind = 'r'
) x
where name !~ '^(floodlight|floodlight_private)(\.|:|$)'
  and name !~ '^pg_toast'
order by kind, name;
