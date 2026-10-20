-- Admin-only broadcast to active team members, using existing Outreach inbox/task tables.
create or replace function public.admin_publish_team_message(
 p_kind text,p_title text,p_body text,p_recipients uuid[] default null,
 p_due_at timestamptz default null,p_priority text default 'normal'
) returns integer language plpgsql security definer set search_path='' as $$
declare recipients uuid[]; sent integer:=0;
begin
 if auth.uid() is null or not exists(select 1 from public.team_permissions p
   where p.user_id=auth.uid() and upper(p.role)='ADMIN' and p.active=true) then
  raise exception 'Active administrator access required' using errcode='42501'; end if;
 if p_kind not in ('update','task') or length(btrim(coalesce(p_title,''))) not between 1 and 160
 or length(coalesce(p_body,''))>4000 or p_priority not in ('low','normal','high') then
  raise exception 'Invalid message, task or priority'; end if;
 if p_recipients is not null and (array_length(p_recipients,1) is null or array_length(p_recipients,1)>500)
 then raise exception 'Choose between 1 and 500 recipients';end if;
 select coalesce(array_agg(x.user_id),array[]::uuid[]) into recipients from (
  select distinct tp.user_id from public.team_permissions tp
  join public.callcenter_profiles cp on cp.user_id=tp.user_id
  where tp.active=true and tp.listed is distinct from false and cp.disabled_at is null
  and (tp.role in ('ADMIN','SALES') or tp.sales_enabled=true)
  and (p_recipients is null or tp.user_id=any(p_recipients))
 ) x;
 if p_recipients is not null and (select count(distinct selected.user_id) from unnest(p_recipients) as selected(user_id))
 <>coalesce(array_length(recipients,1),0) then raise exception 'Some selected recipients are inactive or not eligible';end if;
 if array_length(recipients,1) is null then raise exception 'No active recipients available';end if;
 if p_kind='task' then
  insert into public.outreach_tasks(assigned_to,created_by,title,notes,due_at,priority,status)
   select id,auth.uid(),btrim(p_title),coalesce(p_body,''),p_due_at,p_priority,'open' from unnest(recipients) id;
 end if;
 insert into public.outreach_notifications(recipient_id,title,body,kind)
  select id,btrim(p_title),coalesce(p_body,''),case when p_kind='task' then 'task' else 'general' end
  from unnest(recipients) id;
 get diagnostics sent=row_count;
 return sent;
end $$;
revoke all on function public.admin_publish_team_message(text,text,text,uuid[],timestamptz,text) from public,anon;
grant execute on function public.admin_publish_team_message(text,text,text,uuid[],timestamptz,text) to authenticated;
