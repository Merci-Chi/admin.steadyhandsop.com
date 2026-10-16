import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../admin-settings.js',import.meta.url),'utf8');
async function setup({failPermissions=false}={}) {
 const people=[
  {user_id:'sales',display_name:'Valid Sales',email:'sales@example.com'},
  {user_id:'admin',display_name:'Administrator'},
  {user_id:'demo',display_name:'Demo'},
  {user_id:'inactive',display_name:'Inactive Sales'},
  {user_id:'hidden',display_name:'Hidden Sales'},
  {user_id:'disabled',display_name:'Disabled Sales',disabled_at:'2026-10-01'}
 ];
 let permissions=[
  {user_id:'sales',role:'SALES',active:true,listed:true},
  {user_id:'admin',role:'ADMIN',active:true},
  {user_id:'inactive',role:'SALES',active:false},
  {user_id:'hidden',role:'SALES',active:true,listed:false},
  {user_id:'disabled',role:'SALES',active:true}
 ];
 const writes=[],alerts=[],handlers={};
 const select={value:'',disabled:false,addEventListener(event,fn){handlers[event]=fn},closest(){return {dataset:{phoneId:'phone'}}}};
 const main={innerHTML:'',querySelectorAll(selector){return selector==='[data-phone-assignment]'?[select]:[]}};
 const document={getElementById(id){return id==='adminSettingsContent'?main:null},addEventListener(event,fn){handlers[event]=fn}};
 const c={auth:{getSession:async()=>({data:{session:{user:{id:'admin',email:'admin@example.com'}}}})},from(table){
  const q={select(){return q},eq(){return q},in(){return q},is(){return q},not(){return q},order(){return q},
   maybeSingle:async()=>({data:{role:'ADMIN',active:true}}),
   delete(){writes.push(table);return q},insert(){writes.push(table);return q},
   then(resolve,reject){
    const data=table==='team_permissions'?permissions:table==='callcenter_profiles'?people:table==='callcenter_phone_numbers'?[{id:'phone',phone_number:'+17025550101',active:true}]:[{phone_number_id:'phone',user_id:'demo'}];
    return Promise.resolve(table==='team_permissions'&&failPermissions?{error:{message:'permission lookup failed'}}:{data}).then(resolve,reject);
   }};return q;
 }};
 vm.runInNewContext(source,{document,window:{supabase:{},steadyHandsCRMClient:c},location:{reload(){}},alert:m=>alerts.push(m)});
 await handlers.DOMContentLoaded();
 return {main,select,handlers,writes,alerts,revoke(){permissions=[]}};
}

test('phone selector includes only active listed SALES and ADMIN profiles and preserves an unavailable assignment',async()=>{
 const {main}=await setup();
 const options=main.innerHTML.match(/<select data-phone-assignment>([\s\S]*?)<\/select>/)[1];
 assert.match(options,/Administrator/);
 assert.match(options,/Valid Sales — sales@example.com/);
 assert.match(options,/value="demo" selected disabled/);
 assert.doesNotMatch(options,/Inactive Sales|Hidden Sales|Disabled Sales|>Demo</);
});

test('revoked eligibility is rejected before any assignment is deleted',async()=>{
 const s=await setup();s.revoke();s.select.value='sales';
 await s.handlers.change();
 assert.deepEqual(s.writes,[]);
 assert.match(s.alerts[0],/not an active, listed sales associate/);
 assert.equal(s.select.value,'demo');
 assert.equal(s.select.disabled,false);
});

test('failed permission lookup does not fall back to all profiles',async()=>{
 const s=await setup({failPermissions:true});
 assert.match(s.main.innerHTML,/Could not verify active sales associates and admins/);
 assert.doesNotMatch(s.main.innerHTML,/<select data-phone-assignment>/);
});
