-- Apply this migration to project glonbvrcudwuzjundrii before using Preview Access.
-- Includes portal claim tables and functions if they have not yet been deployed.
-- Run in the Supabase project used by portal.steadyhandsop.com.
-- Preview claim codes are single-use. Do not expose or publish them in public source code.
create extension if not exists pgcrypto;
create table if not exists public.portal_preview_invites (
 id uuid primary key default gen_random_uuid(),
 code_hash text not null unique,
 site_key text not null,
 site_title text not null default 'Your Website Preview',
 preview_url text not null,
 claimed_by uuid references auth.users(id) on delete set null,
 claimed_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.portal_preview_claims (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 site_key text not null,
 site_title text not null,
 preview_url text not null,
 invite_id uuid not null unique references public.portal_preview_invites(id),
 created_at timestamptz not null default now(),
 unique(user_id,site_key)
);
alter table public.portal_preview_invites enable row level security;
alter table public.portal_preview_claims enable row level security;
drop policy if exists "Client can read own claimed previews" on public.portal_preview_claims;
create policy "Client can read own claimed previews" on public.portal_preview_claims
for select to authenticated using (user_id=(select auth.uid()));
grant select on public.portal_preview_claims to authenticated;
create or replace function public.claim_portal_preview(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.portal_preview_invites%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if length(trim(coalesce(p_code,''))) < 16 or length(p_code)>160 then raise exception 'Invalid preview code'; end if;
 select * into v from public.portal_preview_invites
 where code_hash=encode(extensions.digest(trim(p_code),'sha256'),'hex') for update;
 if not found then raise exception 'Preview code not found'; end if;
 if v.expires_at is not null and v.expires_at < now() then raise exception 'Preview code has expired'; end if;
 if v.claimed_by is not null and v.claimed_by <> auth.uid() then raise exception 'This preview code has already been claimed'; end if;
 if v.claimed_by is null then
   update public.portal_preview_invites set claimed_by=auth.uid(),claimed_at=now() where id=v.id;
 end if;
 insert into public.portal_preview_claims(user_id,site_key,site_title,preview_url,invite_id)
 values(auth.uid(),v.site_key,v.site_title,v.preview_url,v.id)
 on conflict (invite_id) do nothing;
 return jsonb_build_object('site_key',v.site_key,'site_title',v.site_title);
end $$;
revoke all on function public.claim_portal_preview(text) from public;
grant execute on function public.claim_portal_preview(text) to authenticated;
-- Only Steady Hands admins may generate codes.
create or replace function public.create_portal_preview_invite(p_site_key text,p_site_title text,p_preview_url text)
returns text language plpgsql security definer set search_path='' as $$
declare v_code text;
begin
 if not exists(select 1 from public.team_permissions p where p.user_id=auth.uid() and p.active=true and upper(p.role::text)='ADMIN')
 then raise exception 'Admin access required'; end if;
 if length(trim(coalesce(p_site_key,'')))<3 or p_preview_url not like 'https://%'
 then raise exception 'A valid site key and HTTPS preview URL are required'; end if;
 v_code:=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.portal_preview_invites(code_hash,site_key,site_title,preview_url,expires_at)
 values(encode(extensions.digest(v_code,'sha256'),'hex'),trim(p_site_key),coalesce(nullif(trim(p_site_title),''),'Your Website Preview'),trim(p_preview_url),now()+interval '60 days');
 return 'https://portal.steadyhandsop.com/login.html?preview_code='||v_code;
end $$;
revoke all on function public.create_portal_preview_invite(text,text,text) from public;
grant execute on function public.create_portal_preview_invite(text,text,text) to authenticated;


-- Admin-only preview access APIs. The invite token is returned ONCE.
alter table public.portal_preview_invites add column if not exists recipient_email text;
alter table public.portal_preview_invites add column if not exists revoked_at timestamptz;

-- Don't allow previously-issued links to be used after revocation.
create or replace function public.claim_portal_preview(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.portal_preview_invites%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if length(trim(coalesce(p_code,''))) < 16 or length(p_code)>160 then raise exception 'Invalid preview code'; end if;
 select * into v from public.portal_preview_invites
 where code_hash=encode(extensions.digest(trim(p_code),'sha256'),'hex') for update;
 if not found then raise exception 'Preview code not found'; end if;
 if v.revoked_at is not null then raise exception 'This preview invitation has been revoked'; end if;
 if v.expires_at is not null and v.expires_at < now() then raise exception 'Preview code has expired'; end if;
 if v.claimed_by is not null and v.claimed_by <> auth.uid() then raise exception 'This preview code has already been claimed'; end if;
 if v.claimed_by is null then
   update public.portal_preview_invites set claimed_by=auth.uid(),claimed_at=now() where id=v.id;
 end if;
 insert into public.portal_preview_claims(user_id,site_key,site_title,preview_url,invite_id)
 values(auth.uid(),v.site_key,v.site_title,v.preview_url,v.id)
 on conflict (invite_id) do nothing;
 return jsonb_build_object('site_key',v.site_key,'site_title',v.site_title);
end $$;
revoke all on function public.claim_portal_preview(text) from public;
grant execute on function public.claim_portal_preview(text) to authenticated;

create or replace function public.admin_create_preview_access(
 p_site_key text,p_site_title text,p_preview_url text,p_site_type text,
 p_recipient_email text default null,p_access_method text default 'both'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_code text;v_site_key text;v_url text;v_existing public.site_keys%rowtype;
begin
 if not exists(select 1 from public.team_permissions p where p.user_id=auth.uid() and p.active=true and upper(p.role::text)='ADMIN') then
   raise exception 'Admin access required';
 end if;
 v_site_key:=upper(trim(coalesce(p_site_key,'')));
 v_url:=trim(coalesce(p_preview_url,''));
 if v_site_key !~ '^SHS-[A-Z0-9]{8,24}$' then raise exception 'Use a valid SHS- preview key'; end if;
 if v_url !~ '^https://(steadyhandsop[.]com|viewyoursite[.]today)/' then raise exception 'Preview URL must use an approved HTTPS host'; end if;
 if p_site_type not in ('custom','template') or p_access_method not in ('both','invite','code') then raise exception 'Invalid preview access type'; end if;
 if p_site_type='custom' and v_url !~ '^https://steadyhandsop[.]com/sites/[a-z0-9-]+(/|$)' then raise exception 'Custom websites must be under /sites/'; end if;
 if length(trim(coalesce(p_site_title,'')))<2 then raise exception 'Business name required'; end if;
 select * into v_existing from public.site_keys where site_key=v_site_key;
 if found then
   if p_site_type='custom' and (v_existing.template_key<>'custom-direct' or v_existing.website_url is distinct from v_url) then
     raise exception 'This key is already assigned to a different website';
   end if;
 else
   if p_site_type<>'custom' then raise exception 'Create template keys through the existing preview system first'; end if;
   insert into public.site_keys(site_key,template_key,business_category,company_name,website_url,active)
   values(v_site_key,'custom-direct','Custom website',trim(p_site_title),v_url,true);
 end if;
 if p_access_method='code' then return jsonb_build_object('site_key',v_site_key,'invite_link',null);end if;
 v_code:=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.portal_preview_invites(code_hash,site_key,site_title,preview_url,recipient_email,expires_at)
 values(encode(extensions.digest(v_code,'sha256'),'hex'),v_site_key,trim(p_site_title),v_url,nullif(trim(coalesce(p_recipient_email,'')),''),now()+interval '60 days');
 return jsonb_build_object('site_key',v_site_key,'invite_link','https://portal.steadyhandsop.com/login.html?preview_code='||v_code);
end $$;
revoke all on function public.admin_create_preview_access(text,text,text,text,text,text) from public;
grant execute on function public.admin_create_preview_access(text,text,text,text,text,text) to authenticated;

create or replace function public.admin_list_preview_access()
returns table(id uuid,site_key text,site_title text,preview_url text,recipient_email text,claimed_at timestamptz,expires_at timestamptz,revoked_at timestamptz,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.team_permissions p where p.user_id=auth.uid() and p.active=true and upper(p.role::text)='ADMIN')
 then raise exception 'Admin access required'; end if;
 return query select i.id,i.site_key,i.site_title,i.preview_url,i.recipient_email,i.claimed_at,i.expires_at,i.revoked_at,i.created_at
 from public.portal_preview_invites i order by i.created_at desc limit 1000;
end $$;
revoke all on function public.admin_list_preview_access() from public;
grant execute on function public.admin_list_preview_access() to authenticated;

create or replace function public.admin_revoke_preview_access(p_invite_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.team_permissions p where p.user_id=auth.uid() and p.active=true and upper(p.role::text)='ADMIN')
 then raise exception 'Admin access required'; end if;
 update public.portal_preview_invites set revoked_at=now() where id=p_invite_id and claimed_at is null and revoked_at is null;
end $$;
revoke all on function public.admin_revoke_preview_access(uuid) from public;
grant execute on function public.admin_revoke_preview_access(uuid) to authenticated;

notify pgrst, 'reload schema';
