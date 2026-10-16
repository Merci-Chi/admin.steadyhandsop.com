-- Run in the Supabase SQL Editor as the project administrator.
-- Preserve a single ADMIN authorization role and add a separate SALES tag.
begin;

alter table public.team_permissions
  add column if not exists sales_enabled boolean not null default false;

comment on column public.team_permissions.sales_enabled is
  'Additional sales membership; does not replace the primary authorization role.';

do $$
declare
  target_id uuid;
begin
  select id into strict target_id
  from auth.users
  where lower(email) = 'kiara@steadyhandsop.com';

  if not exists (select 1 from public.callcenter_profiles where user_id = target_id) then
    raise exception 'Kiara has no callcenter profile; no changes applied.';
  end if;

  insert into public.team_permissions (user_id, role, active, listed, sales_enabled)
  values (target_id, 'ADMIN', true, true, true)
  on conflict (user_id) do update
    set role = 'ADMIN', active = true, listed = true, sales_enabled = true;

  update public.callcenter_profiles
  set disabled_at = null
  where user_id = target_id;
end $$;

commit;

-- Verify the requested account and tags.
select p.email, t.role, t.sales_enabled, t.active, t.listed, p.disabled_at,
       case when t.role = 'ADMIN' and t.sales_enabled
            then array['ADMIN','SALES'] else array[t.role::text] end as tags
from public.team_permissions t
join public.callcenter_profiles p on p.user_id = t.user_id
join auth.users u on u.id = t.user_id
where lower(u.email) = 'kiara@steadyhandsop.com';
