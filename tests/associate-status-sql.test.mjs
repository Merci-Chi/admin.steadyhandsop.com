import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Status restricts access to admins, keeps immutable history, and rejects stale changes',async()=>{
 const db=new PGlite();
 const admin='10000000-0000-4000-8000-000000000001',associate='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create schema auth;grant usage on schema auth to authenticated,anon;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.team_permissions(user_id uuid primary key,role text,active boolean,sales_enabled boolean,listed boolean);
   insert into auth.users values('${admin}'),('${associate}'),('${other}');
   insert into public.team_permissions values('${admin}','ADMIN',true,false,true),('${associate}','SALES',true,false,true),('${other}','USER',true,false,true);`);
  const sql=await readFile(new URL('../sql/associate-status.sql',import.meta.url),'utf8');
  await db.exec(sql);await db.exec(sql);
  const actor=id=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
  const add=(user,title)=>db.query('select * from public.associate_status_add($1,$2)',[user,title]);
  await actor(admin);
  await assert.rejects(()=>add(other,'Step'),/listed sales associate/);
  await assert.rejects(()=>add(associate,'  '),/1–500/);
  await assert.rejects(()=>add(associate,'a'.repeat(501)),/1–500/);
  const item=(await add(associate,'  Sign agreement  ')).rows[0];assert.equal(item.title,'Sign agreement');
  const set=(next,expected)=>db.query('select * from public.associate_status_set_completed($1,$2,$3)',[item.id,next,expected]);
  await set(true,false);
  assert.ok((await db.query('select * from public.associate_status_items')).rows[0].completed_at);
  await assert.rejects(()=>set(false,false),/changed/);
  await set(true,true); // repeated state is a no-op
  await set(false,true);await set(true,false);
  const events=(await db.query('select action from public.associate_status_history order by changed_at,id')).rows;
  assert.deepEqual(events.map(x=>x.action),['added','completed','reopened','completed']);
  await assert.rejects(()=>db.exec('delete from public.associate_status_history'),/permission denied/);
  await assert.rejects(()=>db.exec("update public.associate_status_items set title='tampered'"),/permission denied/);
  await actor(associate);
  assert.equal((await db.query('select * from public.associate_status_items')).rows.length,0);
  assert.equal((await db.query('select * from public.associate_status_history')).rows.length,0);
  await assert.rejects(()=>set(false,true),/administrator access required/);
  await assert.rejects(()=>add(associate,'Step'),/administrator access required/);
  await db.exec(`reset role;update public.team_permissions set active=false where user_id='${admin}';`);
  await actor(admin);await assert.rejects(()=>add(associate,'Step'),/administrator access required/);
  await db.exec('reset role;set role anon;');await assert.rejects(()=>db.exec('select * from public.associate_status_items'),/permission denied/);
 }finally{await db.close();}
});
