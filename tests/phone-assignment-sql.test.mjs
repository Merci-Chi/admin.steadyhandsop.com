import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration=await readFile(new URL('../sql/admin-phone-assignment.sql',import.meta.url),'utf8');
const admin='00000000-0000-0000-0000-000000000001';
const sales='00000000-0000-0000-0000-000000000002';
const other='00000000-0000-0000-0000-000000000003';
const phone='10000000-0000-0000-0000-000000000001';
const second='10000000-0000-0000-0000-000000000002';

test('assignment migration executes and preserves authorization and atomicity in PostgreSQL',async t=>{
 const db=new PGlite();
 try {
 await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql as
   $$select nullif(current_setting('app.test_user', true),'')::uuid$$;
  create table public.team_permissions(user_id uuid primary key,role text,active boolean,listed boolean);
  create table public.callcenter_profiles(user_id uuid primary key,disabled_at timestamptz);
  create table public.callcenter_phone_numbers(id uuid primary key,phone_number text);
  create table public.callcenter_phone_assignments(
   id bigint generated always as identity primary key,
   phone_number_id uuid references public.callcenter_phone_numbers(id),
   user_id uuid references public.callcenter_profiles(user_id),updated_at timestamptz);
  insert into public.team_permissions values
   ('${admin}','ADMIN',true,true),('${sales}','SALES',true,true),('${other}','SALES',true,true);
  insert into public.callcenter_profiles(user_id) values ('${admin}'),('${sales}'),('${other}');
  insert into public.callcenter_phone_numbers values ('${phone}','+17025550101'),('${second}','+17025550102');
 `);
 await db.exec(migration);
 // Idempotent migration, including grants and existing indexes.
 await db.exec(migration);
 const reset=async()=>{
  await db.exec(`reset role; select set_config('app.test_user','${admin}',false);
   update public.team_permissions set active=true,listed=true;
   update public.callcenter_profiles set disabled_at=null;
   delete from public.callcenter_phone_assignments;
   insert into public.callcenter_phone_assignments(phone_number_id,user_id) values
    ('${phone}','${other}'),('${second}','${sales}'); set role authenticated;`);
 };
 const assign=(user=sales,expected=other,id=phone)=>db.query(
  'select public.admin_assign_outbound_phone($1,$2,$3)',[id,user,expected]);
 const snapshot=async()=>{await db.exec('reset role');return (await db.query('select phone_number_id,user_id from public.callcenter_phone_assignments order by phone_number_id')).rows};
 const original=[{phone_number_id:phone,user_id:other},{phone_number_id:second,user_id:sales}];
 await t.test('moves both owners in one transaction and supports unassigning',async()=>{
  await reset();await assign();
  assert.deepEqual(await snapshot(),[{phone_number_id:phone,user_id:sales}]);
  await db.exec('set role authenticated');await assign(null,sales);
  assert.deepEqual(await snapshot(),[]);
 });
 await t.test('active admin can be assigned',async()=>{
  await reset();await assign(admin);
  assert.equal((await snapshot())[0].user_id,admin);
 });
 await t.test('stale owner and missing phone reject without deleting assignments',async()=>{
  await reset();await assert.rejects(assign(sales,null),/another session/);
  assert.deepEqual(await snapshot(),original);
  await db.exec('set role authenticated');await assert.rejects(assign(sales,other,'missing'),/no longer exists/);
  assert.deepEqual(await snapshot(),original);
 });
 for(const change of [`update public.team_permissions set active=false where user_id='${sales}'`,
  `update public.team_permissions set listed=false where user_id='${sales}'`,
  `update public.callcenter_profiles set disabled_at=now() where user_id='${sales}'`]) {
  await t.test('ineligible target is rejected: '+change,async()=>{
   await reset();await db.exec('reset role;'+change+';set role authenticated');
   await assert.rejects(assign(),/active, listed/);assert.deepEqual(await snapshot(),original);
  });
 }
 await t.test('non-admin, revoked admin, and anonymous callers cannot mutate',async()=>{
  await reset();await db.query("select set_config('app.test_user',$1,false)",[sales]);
  await assert.rejects(assign(),/ADMIN access required/);assert.deepEqual(await snapshot(),original);
  await db.exec(`update public.team_permissions set active=false where user_id='${admin}';set role authenticated`);
  await db.query("select set_config('app.test_user',$1,false)",[admin]);
  await assert.rejects(assign(),/ADMIN access required/);assert.deepEqual(await snapshot(),original);
  await db.exec('set role anon');await assert.rejects(assign(),/permission denied/);
  assert.deepEqual(await snapshot(),original);
 });
 await t.test('insert failure rolls back deletion of BOTH existing assignments',async()=>{
  await reset();await db.exec(`reset role;
   create function public.fail_assignment() returns trigger language plpgsql as $$begin raise exception 'test insert failure';end$$;
   create trigger reject_insert before insert on public.callcenter_phone_assignments for each row execute function public.fail_assignment();
   set role authenticated;`);
  await assert.rejects(assign(),/test insert failure/);assert.deepEqual(await snapshot(),original);
  await db.exec('drop trigger reject_insert on public.callcenter_phone_assignments');
 });
 await t.test('database uniqueness prevents conflicting legacy writes',async()=>{
  await reset();await db.exec('reset role');
  await assert.rejects(db.query('insert into public.callcenter_phone_assignments(phone_number_id,user_id) values ($1,$2)',[phone,admin]),/duplicate key/);
  await db.exec(`delete from public.callcenter_phone_assignments where phone_number_id='${phone}'`);
  await assert.rejects(db.query('insert into public.callcenter_phone_assignments(phone_number_id,user_id) values ($1,$2)',[phone,sales]),/duplicate key/);
 });
 } finally {await db.close()}
});
