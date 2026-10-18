-- Run once in the Supabase SQL editor. Safe to run again.
-- Uses existing team_permissions; independent of questionnaire migrations.
begin;
create or replace function public.associate_status_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.team_permissions where user_id=auth.uid() and role='ADMIN' and active=true);
$$;
revoke all on function public.associate_status_is_admin() from public,anon,authenticated;
grant execute on function public.associate_status_is_admin() to authenticated;

create table if not exists public.associate_status_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 500),
 completed boolean not null default false,
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null,
 completed_at timestamptz,
 check(completed = (completed_at is not null))
);
create table if not exists public.associate_status_history (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.associate_status_items(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null,
 action text not null check(action in ('added','completed','reopened')),
 changed_by uuid references auth.users(id) on delete set null,
 changed_at timestamptz not null default now()
);
create index if not exists associate_status_items_user_idx on public.associate_status_items(user_id,created_at,id);
create index if not exists associate_status_history_user_idx on public.associate_status_history(user_id,changed_at desc,id);
alter table public.associate_status_items enable row level security;
alter table public.associate_status_history enable row level security;
revoke all on public.associate_status_items,public.associate_status_history from public,anon,authenticated;
grant select on public.associate_status_items,public.associate_status_history to authenticated;
grant all on public.associate_status_items,public.associate_status_history to service_role;
drop policy if exists associate_status_items_admin_read on public.associate_status_items;
create policy associate_status_items_admin_read on public.associate_status_items for select to authenticated using ((select public.associate_status_is_admin()));
drop policy if exists associate_status_history_admin_read on public.associate_status_history;
create policy associate_status_history_admin_read on public.associate_status_history for select to authenticated using ((select public.associate_status_is_admin()));

create or replace function public.associate_status_add(p_user_id uuid,p_title text)
returns public.associate_status_items language plpgsql security definer set search_path = '' as $$
declare v_item public.associate_status_items;
begin
 if auth.uid() is null or not public.associate_status_is_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 500 then raise exception 'Enter a checklist item of 1–500 characters.'; end if;
 if not exists(select 1 from public.team_permissions where user_id=p_user_id and (role='SALES' or sales_enabled=true) and listed is distinct from false) then raise exception 'Choose a listed sales associate.'; end if;
 insert into public.associate_status_items(user_id,title,created_by) values(p_user_id,btrim(p_title),auth.uid()) returning * into v_item;
 insert into public.associate_status_history(item_id,user_id,title,action,changed_by) values(v_item.id,v_item.user_id,v_item.title,'added',auth.uid());
 return v_item;
end $$;

create or replace function public.associate_status_set_completed(p_item_id uuid,p_completed boolean,p_expected_completed boolean)
returns public.associate_status_items language plpgsql security definer set search_path = '' as $$
declare v_item public.associate_status_items;
begin
 if auth.uid() is null or not public.associate_status_is_admin() then raise exception 'Active administrator access required.' using errcode='42501'; end if;
 if p_completed is null or p_expected_completed is null then raise exception 'Choose a completion status.'; end if;
 select * into v_item from public.associate_status_items where id=p_item_id for update;
 if not found then raise exception 'Checklist item no longer exists.'; end if;
 if v_item.completed is distinct from p_expected_completed then raise exception 'This item changed. Refresh before trying again.' using errcode='40001'; end if;
 if v_item.completed=p_completed then return v_item; end if;
 update public.associate_status_items set completed=p_completed,completed_at=case when p_completed then now() else null end where id=p_item_id returning * into v_item;
 insert into public.associate_status_history(item_id,user_id,title,action,changed_by) values(v_item.id,v_item.user_id,v_item.title,case when p_completed then 'completed' else 'reopened' end,auth.uid());
 return v_item;
end $$;
revoke all on function public.associate_status_add(uuid,text) from public,anon,authenticated;
revoke all on function public.associate_status_set_completed(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.associate_status_add(uuid,text) to authenticated;
grant execute on function public.associate_status_set_completed(uuid,boolean,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
