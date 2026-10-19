import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=await readFile(new URL('../sql/admin-phone-voicemail.sql',import.meta.url),'utf8');
const admin='00000000-0000-0000-0000-000000000001',sales='00000000-0000-0000-0000-000000000002';
test('voicemail migration preserves Admin edits and enforces database authorization',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.test_user',true),'')::uuid$$;
   create table public.team_permissions(user_id uuid primary key,role text,active boolean);
   insert into public.team_permissions values ('${admin}','ADMIN',true),('${sales}','SALES',true);
   create table public.callcenter_phone_numbers(id text primary key,phone_number text,updated_at timestamptz);
   insert into public.callcenter_phone_numbers values ('phone','+17025550101',now());
   alter table public.callcenter_phone_numbers enable row level security;
   create policy existing_admin_policy on public.callcenter_phone_numbers using (false);
  `);
  await db.exec(migration);await db.exec(migration);
  const text=async()=>(await db.query('select voicemail_greeting from public.callcenter_phone_numbers')).rows[0].voicemail_greeting;
  assert.match(await text(),/\(702\) 775-9756/);
  const save=(greeting,id='phone')=>db.query('select public.admin_set_phone_voicemail($1,$2)',[id,greeting]);
  await db.exec(`select set_config('app.test_user','${admin}',false);set role authenticated;`);
  await save('  Custom Admin greeting  ');await db.exec('reset role');
  assert.equal(await text(),'Custom Admin greeting');await db.exec(migration);assert.equal(await text(),'Custom Admin greeting');
  for(const greeting of ['', '   ',null,'a'.repeat(501)]) {await db.exec('set role authenticated');await assert.rejects(save(greeting),/between 1 and 500/);}
  await assert.rejects(save('Hello','missing'),/no longer exists/);
  await db.query("select set_config('app.test_user',$1,false)",[sales]);await assert.rejects(save('Sales edit'),/ADMIN access/);
  await db.exec(`reset role;update public.team_permissions set active=false where user_id='${admin}';select set_config('app.test_user','${admin}',false);set role authenticated;`);
  await assert.rejects(save('Revoked edit'),/ADMIN access/);
  await db.exec('set role anon');await assert.rejects(save('Anonymous edit'),/permission denied/);
  await db.exec('reset role');assert.equal(await text(),'Custom Admin greeting');
  assert.equal((await db.query("select count(*)::int as n from pg_policies where policyname='existing_admin_policy'")).rows[0].n,1);
 } finally {await db.close();}
});
