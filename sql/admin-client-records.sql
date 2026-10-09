-- Run in the SQL editor for the Steady Hands CRM project glonbvrcudwuzjundrii.
-- Client status is EXPLICIT and never inferred from signatures or requests.
create table if not exists public.admin_client_records (
 id uuid primary key default gen_random_uuid(),
 portal_user_id uuid unique,
 company_name text not null,
 contact_name text,
 email text,
 phone text,
 site_url text,
 site_status text not null default 'onboarding' check(site_status in ('onboarding','live','needs_review','waiting_on_content','inactive')),
 hosting_plan text not null default 'none' check(hosting_plan in ('none','standard','backend')),
 billing_status text not null default 'unknown' check(billing_status in ('unknown','active','past_due','canceled')),
 assigned_to text,
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists admin_client_records_company_idx on public.admin_client_records(company_name);
alter table public.admin_client_records enable row level security;
drop policy if exists admin_client_records_admin_only on public.admin_client_records;
create policy admin_client_records_admin_only on public.admin_client_records
 for all to authenticated
 using (exists(select 1 from public.team_permissions p where p.user_id = (select auth.uid()) and p.active = true and upper(p.role::text) = 'ADMIN'))
 with check (exists(select 1 from public.team_permissions p where p.user_id = (select auth.uid()) and p.active = true and upper(p.role::text) = 'ADMIN'));
grant select,insert,update,delete on public.admin_client_records to authenticated;
