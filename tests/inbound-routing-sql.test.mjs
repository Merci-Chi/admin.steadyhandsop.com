import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration=await readFile(new URL('../sql/admin-inbound-destinations.sql',import.meta.url),'utf8');
test('incoming routing migration preserves existing records and enforces valid destinations',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`
   create table public.outreach_inbound_settings(user_id text primary key,cellphone_number text not null);
   create table public.callcenter_phone_numbers(id text primary key,phone_number text not null);
   create table public.outreach_inbound_calls(id text primary key,call_sid text);
   insert into public.outreach_inbound_settings values ('agent','+17025550109');
   insert into public.callcenter_phone_numbers values ('business','+17025550101');
   insert into public.outreach_inbound_calls values ('call','CAexisting');
   alter table public.callcenter_phone_numbers enable row level security;
   create policy existing_policy on public.callcenter_phone_numbers for select using (true);
  `);
  await db.exec(migration);
  await db.exec(migration);
  assert.deepEqual((await db.query('select * from public.callcenter_phone_numbers')).rows,[{
   id:'business',phone_number:'+17025550101',inbound_destination:'app',inbound_forward_number:null
  }]);
  assert.deepEqual((await db.query('select * from public.outreach_inbound_calls')).rows,[{
   id:'call',call_sid:'CAexisting',route_destination:'app',forward_number:null
  }]);
  await db.exec("update public.outreach_inbound_settings set cellphone_number=null");
  for(const value of [null,'bad','+17025550101']) {
   await assert.rejects(db.query("update public.callcenter_phone_numbers set inbound_destination='forward',inbound_forward_number=$1",[value]),/phone_inbound_destination_check/);
  }
  await assert.rejects(db.exec("update public.callcenter_phone_numbers set inbound_destination='unknown'"),/phone_inbound_destination_check/);
  await db.exec("update public.callcenter_phone_numbers set inbound_destination='forward',inbound_forward_number='+17025550109'");
  await db.exec(migration);
  assert.equal((await db.query('select inbound_destination from public.callcenter_phone_numbers')).rows[0].inbound_destination,'forward');
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.callcenter_phone_numbers'::regclass")).rows[0].relrowsecurity,true);
  assert.equal((await db.query("select count(*)::int as count from pg_policies where tablename='callcenter_phone_numbers' and policyname='existing_policy'")).rows[0].count,1);
 } finally {await db.close()}
});
