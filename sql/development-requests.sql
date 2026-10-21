-- Apply once in the shared Supabase project's SQL Editor before deploying both sites.
begin;
create table if not exists public.development_requests (
 id bigint generated always as identity primary key,
 crm_id text not null,
 submitted_by uuid not null references auth.users(id),
 company_name text,
 phone text not null,
 business_needs text not null,
 status text not null default 'new' check (status in ('new','in_progress','completed')),
 created_at timestamptz not null default now(),
 viewed_at timestamptz,
 updated_at timestamptz not null default now()
);
create index if not exists development_requests_new_idx on public.development_requests (created_at desc) where status = 'new';
create index if not exists development_requests_crm_idx on public.development_requests (crm_id);
alter table public.development_requests enable row level security;
revoke all on public.development_requests from public,anon,authenticated;
grant select,insert,update on public.development_requests to authenticated;
grant usage,select on sequence public.development_requests_id_seq to authenticated;
drop policy if exists development_requests_submit on public.development_requests;
create policy development_requests_submit on public.development_requests
 for insert to authenticated with check (
 submitted_by = auth.uid()
 and status = 'new' and viewed_at is null
 and exists (select 1 from public.crm c where c.id::text = crm_id
             and c.assigned_user_id::text = auth.uid()::text)
);
drop policy if exists development_requests_admin_read on public.development_requests;
create policy development_requests_admin_read on public.development_requests
 for select to authenticated using (
 exists (select 1 from public.team_permissions t where t.user_id = auth.uid()
 and upper(t.role::text) = 'ADMIN' and t.active = true)
);
drop policy if exists development_requests_admin_update on public.development_requests;
create policy development_requests_admin_update on public.development_requests
 for update to authenticated using (
 exists (select 1 from public.team_permissions t where t.user_id = auth.uid()
 and upper(t.role::text) = 'ADMIN' and t.active = true)
) with check (
 exists (select 1 from public.team_permissions t where t.user_id = auth.uid()
 and upper(t.role::text) = 'ADMIN' and t.active = true)
);
-- Protect immutable submission fields; admins may only change status/read timestamps.
create or replace function public.protect_development_request()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
 if TG_OP = 'UPDATE' then
  if row(NEW.crm_id,NEW.submitted_by,NEW.company_name,NEW.phone,NEW.business_needs,NEW.created_at)
     is distinct from row(OLD.crm_id,OLD.submitted_by,OLD.company_name,OLD.phone,OLD.business_needs,OLD.created_at) then
   raise exception 'Submission details are immutable';
  end if;
  NEW.updated_at = now();
 end if;
 return NEW;
end $$;
drop trigger if exists development_requests_protect on public.development_requests;
create trigger development_requests_protect before update on public.development_requests
for each row execute function public.protect_development_request();
notify pgrst, 'reload schema';
commit;
