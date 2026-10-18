-- Apply in the Supabase SQL Editor as the project administrator BEFORE deploying
-- the phone controls. Existing caller-ID tables and auth roles are required.
-- Duplicate existing assignments cause this migration to roll back; resolve them
-- deliberately rather than discarding any current ownership automatically.
begin;

create unique index if not exists callcenter_phone_assignments_one_phone
  on public.callcenter_phone_assignments (phone_number_id);
create unique index if not exists callcenter_phone_assignments_one_user
  on public.callcenter_phone_assignments (user_id);

create or replace function public.admin_assign_outbound_phone(
  p_phone_number_id text,
  p_user_id uuid,
  p_expected_user_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  phone public.callcenter_phone_numbers%rowtype;
  current_user_id uuid;
begin
  -- Do not rely on the browser's admin gate. Hold the authorization row while
  -- writing so a concurrent revocation cannot race this authorization check.
  perform 1 from public.team_permissions
    where user_id = auth.uid() and role = 'ADMIN' and active = true
    for share;
  if not found then
    raise exception 'Active ADMIN access required' using errcode = '42501';
  end if;

  -- Serializes reassignment, including writes from older clients and services.
  -- These are small administrative tables; locks last for this transaction only.
  lock table public.callcenter_phone_numbers in share row exclusive mode;
  lock table public.callcenter_phone_assignments in share row exclusive mode;

  select * into phone from public.callcenter_phone_numbers
    where id::text = p_phone_number_id;
  if not found then
    raise exception 'Phone number no longer exists. Refresh and try again.';
  end if;

  select user_id into current_user_id from public.callcenter_phone_assignments
    where phone_number_id = phone.id;
  if current_user_id is distinct from p_expected_user_id then
    raise exception 'Assignment changed in another session. Refresh and try again.';
  end if;

  if p_user_id is not null then
    perform 1 from public.team_permissions t
      join public.callcenter_profiles p on p.user_id = t.user_id
      where t.user_id = p_user_id and t.role in ('SALES','ADMIN')
        and t.active = true and t.listed is distinct from false
        and p.disabled_at is null
      for share of t, p;
    if not found then
      raise exception 'Choose an active, listed sales associate or admin.';
    end if;
  end if;

  -- Any error, including insert/constraint/trigger errors, rolls back BOTH deletes.
  delete from public.callcenter_phone_assignments
    where phone_number_id = phone.id or user_id = p_user_id;
  if p_user_id is not null then
    insert into public.callcenter_phone_assignments
      (user_id, phone_number_id, updated_at)
      values (p_user_id, phone.id, now());
  end if;
end;
$$;

revoke all on function public.admin_assign_outbound_phone(text,uuid,uuid) from public, anon;
grant execute on function public.admin_assign_outbound_phone(text,uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
