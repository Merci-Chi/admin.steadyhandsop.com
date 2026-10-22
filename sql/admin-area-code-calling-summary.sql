-- Deploy with the Supabase SQL Editor before using the All Leads area-code picker.
-- Read-only, admin-only summary. A lead is uncalled when crm.lastcalled IS NULL.
-- Counts are based on active, non-DNC CRM leads with valid NANP numbers.
-- SECURITY DEFINER is protected by an explicit admin-role check.
-- The guard below replaces the function with an explicit role check.
create or replace function public.admin_area_code_calling_summary()
returns table(area_code text, state_code text, timezone text, uncalled_count bigint, total_count bigint)
language plpgsql stable security definer set search_path = ''
as $
#variable_conflict use_column
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

revoke all on function public.admin_area_code_calling_summary() from public, anon;
grant execute on function public.admin_area_code_calling_summary() to authenticated;
