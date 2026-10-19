import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
test('statement access checks preserve admin, pause, and denied read/write behavior',async()=>{
const db=new PGlite();
await db.exec(`
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create table public.team_permissions(user_id uuid primary key, active boolean, role text);
create table public.sh_associate_pause(user_id uuid, status text);
create table public.crm(id int primary key);
insert into crm values (1),(2);
insert into team_permissions values ('00000000-0000-0000-0000-000000000001',true,'ADMIN'),('00000000-0000-0000-0000-000000000002',true,'SALES');
create function public.is_steadyhands_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.team_permissions where user_id=auth.uid() and active=true and role='ADMIN') $$;
create function public.sh_outreach_access_allowed() returns boolean language sql stable security definer set search_path='' as $$ select not exists(select 1 from public.sh_associate_pause p where p.user_id=auth.uid() and p.status='pause_action_needed') $$;
alter table crm enable row level security;
grant select,update on crm to authenticated;
create policy "Admins view all crm leads" on crm for select to authenticated using(is_steadyhands_admin());
create policy "Admins update crm leads" on crm for update to authenticated using(is_steadyhands_admin()) with check(is_steadyhands_admin());
create policy sh_pause_guard on crm as restrictive for all to authenticated using(sh_outreach_access_allowed()) with check(sh_outreach_access_allowed());
`);
const patch=await readFile(new URL('../sql/admin-lead-access-performance.sql',import.meta.url),'utf8');
async function check(){
for(const [uid,paused,expected] of [['1',false,2],['1',true,0],['2',false,0],['3',false,0]]){
await db.exec('reset role; delete from sh_associate_pause;');
if(paused)await db.exec("insert into sh_associate_pause values('00000000-0000-0000-0000-000000000001','pause_action_needed');");
await db.query("select set_config('test.uid',$1,false)",['00000000-0000-0000-0000-'+uid.padStart(12,'0')]);
await db.exec('set role authenticated');
assert.equal((await db.query('select count(*)::int as n from crm')).rows[0].n,expected);
assert.equal((await db.query('update crm set id=id returning id')).rows.length,expected);
await db.exec('reset role');
}
}
await check();await db.exec(patch);await check();await db.close();
});
