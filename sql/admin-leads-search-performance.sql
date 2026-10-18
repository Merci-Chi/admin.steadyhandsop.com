-- Run in Supabase SQL Editor as the project administrator.
-- Run each numbered statement SEPARATELY (highlight it and click Run).
-- CREATE INDEX CONCURRENTLY must not run inside a transaction or a batch.
-- No lead data, assignments, policies, or permissions are changed.

-- 1. One-time extension setup (run these setup statements together).
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
select n.nspname as trgm_schema
from pg_catalog.pg_extension e
join pg_catalog.pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pg_trgm';

-- 2. Run this CREATE INDEX statement alone.
-- Matches all nine ILIKE search fields, including searches inside words.
-- If section 1 returns public, replace extensions.gin_trgm_ops with public.gin_trgm_ops below.
create index concurrently if not exists crm_admin_search_trgm_idx
  on public.crm using gin (
    company extensions.gin_trgm_ops,
    name extensions.gin_trgm_ops,
    phone extensions.gin_trgm_ops,
    altphone extensions.gin_trgm_ops,
    email extensions.gin_trgm_ops,
    website extensions.gin_trgm_ops,
    notes extensions.gin_trgm_ops,
    state_code extensions.gin_trgm_ops,
    timezone extensions.gin_trgm_ops
  );

-- 3. Run this statement alone: active/all-assignment lists sorted newest first.
create index concurrently if not exists crm_admin_archive_created_idx
  on public.crm (admin_archived, created desc nulls last, id);

-- 4. Run this statement alone: assigned/unassigned lists sorted newest first.
create index concurrently if not exists crm_admin_assignment_created_idx
  on public.crm (admin_archived, assigned_user_id, created desc nulls last, id);

-- 5. Refresh the planner's statistics once all index builds complete.
analyze public.crm;

-- 6. Verify successful index builds. All three rows should show indisvalid=true.
select c.relname as index_name, i.indisvalid
from pg_catalog.pg_index i
join pg_catalog.pg_class c on c.oid = i.indexrelid
where i.indrelid = 'public.crm'::regclass
  and c.relname in (
    'crm_admin_search_trgm_idx',
    'crm_admin_archive_created_idx',
    'crm_admin_assignment_created_idx'
  );
