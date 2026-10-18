-- Apply after assigned-action-questionnaires.sql and questionnaire-phone-setup.sql.
-- No-start-date variants ask the associate to choose a weekday before submitting.
begin;
alter table public.outreach_associates drop constraint if exists outreach_hourly_requires_start_date;
alter table public.outreach_action_assignments add column if not exists choose_start_date boolean not null default false;
alter table public.outreach_start_date_history alter column previous_start_date drop not null;
create or replace function public.outreach_admin_assign_action_v2(
  p_user_id uuid,p_current_basis text,p_start_date date default null,p_choose_start_date boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.outreach_is_admin() then
    raise exception 'Active administrator access required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_current_basis is null or p_current_basis not in ('hourly','commission') then
    raise exception 'Choose a user and their current agreement.';
  end if;
  if not coalesce(p_choose_start_date,false) and p_current_basis = 'hourly' and p_start_date is null then
    raise exception 'Hourly associates need a scheduled start date.';
  end if;
  if p_start_date is not null and extract(isodow from p_start_date) not between 1 and 5 then
    raise exception 'Choose a Monday-Friday start date.';
  end if;
  if p_choose_start_date and p_start_date is not null then raise exception 'Leave the start date empty for associate selection.'; end if;
  -- A common advisory lock also serializes cancellation/reassignment with writes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  insert into public.outreach_associates(user_id,current_basis,start_date)
  values(p_user_id,p_current_basis,p_start_date)
  on conflict(user_id) do update set current_basis=excluded.current_basis,
    start_date=excluded.start_date,updated_at=now();
  insert into public.outreach_action_assignments(user_id,assigned_by,choose_start_date)
  values(p_user_id,auth.uid(),coalesce(p_choose_start_date,false))
  on conflict(user_id) do update set id=gen_random_uuid(),status='assigned',
    assigned_by=auth.uid(),assigned_at=now(),completed_at=null,choose_start_date=excluded.choose_start_date
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.outreach_action_extend_start_date(
  p_assignment_id uuid,p_expected_start_date date,p_new_start_date date
) returns date language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_assignment public.outreach_action_assignments%rowtype;
  v_associate public.outreach_associates%rowtype;
  v_today date := (current_timestamp at time zone 'America/Los_Angeles')::date;
begin
  if v_user is null then raise exception 'Please sign in.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
  select * into v_assignment from public.outreach_action_assignments
    where id=p_assignment_id and user_id=v_user and status='assigned' for update;
  if not found then raise exception 'This action is not assigned to your account or is already closed.' using errcode='42501'; end if;
  select * into strict v_associate from public.outreach_associates where user_id=v_user for update;
  if v_associate.current_basis <> 'hourly' and not v_assignment.choose_start_date then raise exception 'Start-date extensions apply only to hourly associates.'; end if;
  if p_expected_start_date is distinct from v_associate.start_date then
    raise exception 'Your start date changed. Reload before continuing.' using errcode='40001';
  end if;
  if p_new_start_date is null or (v_associate.start_date is not null and p_new_start_date <= v_associate.start_date) then raise exception 'Choose a later start date.'; end if;
  if extract(isodow from p_new_start_date) not between 1 and 5 then raise exception 'Choose Monday through Friday.'; end if;
  if p_new_start_date < v_today or p_new_start_date > (v_today + interval '4 months')::date then
    raise exception 'Choose a date within the next four months.';
  end if;
  update public.outreach_associates set start_date=p_new_start_date,updated_at=now() where user_id=v_user;
  insert into public.outreach_start_date_history(user_id,previous_start_date,new_start_date,changed_by)
    values(v_user,v_associate.start_date,p_new_start_date,v_user);
  -- Submission remains pending until the associate finishes their questionnaire.
  return p_new_start_date;
end $$;

create or replace function public.outreach_action_submit(
  p_assignment_id uuid,p_selected_path text,p_local_timezone text,p_work_timezone text,
  p_shift_start_minutes integer,p_preferred_weekly_hours integer,
  p_quota_acknowledged boolean,p_confirmed_start_date date
) returns public.outreach_action_preferences language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_assignment public.outreach_action_assignments%rowtype;
  v_associate public.outreach_associates%rowtype;
  v_result public.outreach_action_preferences%rowtype;
begin
  if v_user is null then raise exception 'Please sign in.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
  select * into v_assignment from public.outreach_action_assignments
    where id=p_assignment_id and user_id=v_user and status='assigned' for update;
  if not found then raise exception 'This action is not assigned to your account or is already closed.' using errcode='42501'; end if;
  select * into strict v_associate from public.outreach_associates where user_id=v_user for update;
  if p_selected_path is null or p_selected_path not in ('hourly','commission') then raise exception 'Choose hourly or commission.'; end if;
  if v_associate.current_basis='commission' and p_selected_path <> 'commission' then raise exception 'An hourly agreement must be arranged with your administrator.'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_local_timezone) then raise exception 'Choose a valid local timezone.'; end if;
  if p_work_timezone is null or p_work_timezone not in ('America/Los_Angeles','America/Chicago','America/New_York') then raise exception 'Choose Pacific, Central, or Eastern work time.'; end if;
  if p_shift_start_minutes is null or p_shift_start_minutes not between 540 and 900 or p_shift_start_minutes % 15 <> 0 then raise exception 'Choose a two-hour window within 9 AM to 5 PM.'; end if;
  if p_preferred_weekly_hours is null or p_preferred_weekly_hours not between 2 and 40 then raise exception 'Choose between 2 and 40 weekly hours.'; end if;
  if p_selected_path='hourly' then
    if p_quota_acknowledged is distinct from true then raise exception 'Acknowledge the minimum quota of 2 sales per week.'; end if;
    if p_confirmed_start_date is null or p_confirmed_start_date is distinct from v_associate.start_date then raise exception 'Confirm your current scheduled start date.'; end if;
  end if;
  if v_assignment.choose_start_date and (p_confirmed_start_date is null or p_confirmed_start_date is distinct from v_associate.start_date) then raise exception 'Choose and confirm your start date.'; end if;
  insert into public.outreach_action_preferences(
    user_id,selected_path,local_timezone,work_timezone,shift_start_minutes,
    preferred_weekly_hours,trial_quota_acknowledged_at,confirmed_start_date,commission_agreement_requested
  ) values (
    v_user,p_selected_path,p_local_timezone,p_work_timezone,p_shift_start_minutes,
    p_preferred_weekly_hours,case when p_selected_path='hourly' then now() else null end,
    case when p_selected_path='hourly' or v_assignment.choose_start_date then v_associate.start_date else null end,
    v_associate.current_basis='hourly' and p_selected_path='commission'
  ) on conflict(user_id) do update set
    selected_path=excluded.selected_path,local_timezone=excluded.local_timezone,
    work_timezone=excluded.work_timezone,shift_start_minutes=excluded.shift_start_minutes,
    preferred_weekly_hours=excluded.preferred_weekly_hours,
    trial_quota_acknowledged_at=excluded.trial_quota_acknowledged_at,
    confirmed_start_date=excluded.confirmed_start_date,
    commission_agreement_requested=excluded.commission_agreement_requested,updated_at=now()
  returning * into v_result;
  update public.outreach_action_assignments set status='completed',completed_at=now() where id=v_assignment.id;
  return v_result;
end $$;


revoke all on function public.outreach_admin_assign_action_v2(uuid,text,date,boolean) from public,anon,authenticated;
grant execute on function public.outreach_admin_assign_action_v2(uuid,text,date,boolean) to authenticated;
-- Keep the phone-aware submit wrapper as the only browser submission endpoint.
revoke all on function public.outreach_action_submit(uuid,text,text,text,integer,integer,boolean,date) from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
