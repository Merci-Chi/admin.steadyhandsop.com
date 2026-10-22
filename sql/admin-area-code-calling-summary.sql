-- Deploy in the Supabase SQL Editor before using the All Leads area-code picker.
-- Read-only; administrator-only. Uses the CRM lastcalled field (not assignments).
create or replace function public.admin_area_code_calling_summary()
returns table(area_code text, state_code text, timezone text, uncalled_count bigint, total_count bigint)
language sql stable security definer set search_path = ''
as $$
 with codes as (
  select distinct c.id, c.state_code, c.timezone, c.lastcalled,
   substring(regexp_replace(case when length(regexp_replace(split_part(p.phone, 'x', 1), '[^0-9]', '', 'g')) = 11
      and left(regexp_replace(split_part(p.phone, 'x', 1), '[^0-9]', '', 'g'),1) = '1'
     then substr(regexp_replace(split_part(p.phone, 'x', 1), '[^0-9]', '', 'g'),2)
     else regexp_replace(split_part(p.phone, 'x', 1), '[^0-9]', '', 'g') end,1,3) as code
  from public.crm c
  cross join lateral (values(c.phone),(c.altphone)) p(phone)
  where (c.admin_archived is null or c.admin_archived = false)
   and (c.do_not_call is null or c.do_not_call = false)
   and c.lastcalled is null
   and (c.stage is null or lower(c.stage) not in ('donotcall','donotcontact','dnc'))
   and p.phone is not null
 ), valid as (
  select * from codes where code ~ '^[2-9][0-9]{2}$'
 ), counts as (
  select code, count(distinct id) as uncalled_count from valid group by code
 ), locations as (
  select code, state_code, timezone, count(*) as frequency,
   row_number() over(partition by code order by count(*) desc, timezone nulls last, state_code nulls last) as rank
  from valid group by code,state_code,timezone
 )
 select counts.code, locations.state_code, locations.timezone, counts.uncalled_count, counts.uncalled_count
 from counts join locations on counts.code=locations.code and locations.rank=1;
$$;
revoke all on function public.admin_area_code_calling_summary() from public, anon;
grant execute on function public.admin_area_code_calling_summary() to authenticated;
-- SECURITY DEFINER bypasses CRM RLS: verify the user's admin role inside this function.
-- The guard below replaces the function with an explicit role check.
create or replace function public.admin_area_code_calling_summary()
returns table(area_code text, state_code text, timezone text, uncalled_count bigint, total_count bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
 if auth.uid() is null or not public.is_steadyhands_admin() then
  raise exception 'Administrator access required' using errcode = '42501';
 end if;
 return query
 with numbers as (
  select distinct c.id, c.state_code, c.timezone, c.lastcalled,
   case when length(d.digits)=11 and left(d.digits,1)='1' then substr(d.digits,2)
    else d.digits end as national
  from public.crm c
  cross join lateral (values(c.phone),(c.altphone)) p(phone)
  cross join lateral (select regexp_replace(split_part(coalesce(p.phone,''),'x',1),'[^0-9]','','g') as digits) d
  where coalesce(c.admin_archived,false)=false
   and coalesce(c.do_not_call,false)=false
   and c.lastcalled is null
   and lower(coalesce(c.stage,'')) not in ('donotcall','donotcontact','dnc')
 ), valid as (
  select distinct id,state_code,timezone,substr(national,1,3) as code
  from numbers where national ~ '^[2-9][0-9]{9}$'
 ), counts as (
  select code,count(distinct id) as pending from valid group by code
 ), locations as (
  select code,state_code,timezone,
  row_number() over(partition by code order by count(*) desc,timezone nulls last,state_code nulls last) as rank
  from valid group by code,state_code,timezone
 )
 select counts.code, locations.state_code, locations.timezone, counts.pending, counts.pending
 from counts join locations on counts.code=locations.code and locations.rank=1;
end;
$$;
