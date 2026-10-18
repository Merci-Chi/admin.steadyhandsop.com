import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../admin-settings.js',import.meta.url),'utf8');
async function setup({failPermissions=false,phoneError=null,assignmentError=null,mutationError=null,throwMutation=false,emptyMutation=false,rpcError=null,active=true,status='ready',confirmResult=true,session=true}={}) {
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
 const writes=[],alerts=[],rpcCalls=[],handlers={},controls={};let reloads=0,removed=false;
 const control=name=>controls[name]??=( {value:'',disabled:false,dataset:{adminAction:name},
  addEventListener(event,fn){handlers[name+':'+event]=fn},closest(){return card}} );
 const card={dataset:{phoneId:'phone',userId:'sales'},querySelectorAll(){return [control('approve'),control('reject')]},classList:{add(){}},remove(){removed=true}};
 const select=control('assignment');
 const main={innerHTML:'',querySelectorAll(selector){
  const name={'[data-phone-assignment]':'assignment','[data-phone-ready]':'ready','[data-phone-toggle]':'toggle','[data-phone-delete]':'delete'}[selector];
  return name?[control(name)]:selector==='[data-admin-action]'?[control('approve'),control('reject')]:[];
 }};
 const form=control('form');form.querySelector=()=>control('submit');
 const elements={adminSettingsContent:main,adminAddPhoneForm:form,adminPhoneNumber:control('number'),adminPhoneLabel:control('label')};
 const document={getElementById(id){return elements[id]||null},addEventListener(event,fn){handlers[event]=fn}};
 const c={auth:{getSession:async()=>({data:{session:session?{user:{id:'admin',email:'admin@example.com'}}:null}})},
  async rpc(name,args){rpcCalls.push({name,args});return {error:rpcError}},
  from(table){let write=null;const filters=[];
   const q={select(){return q},eq(...args){filters.push(['eq',...args]);return q},in(){return q},is(){return q},not(...args){filters.push(['not',...args]);return q},order(){return q},
   maybeSingle:async()=>({data:{role:'ADMIN',active:true}}),
   delete(){write={table,action:'delete',filters};writes.push(write);return q},
   update(payload){write={table,action:'update',payload,filters};writes.push(write);return q},
   insert(payload){write={table,action:'insert',payload,filters};writes.push(write);return q},
   then(resolve,reject){
    if(write){return (throwMutation?Promise.reject(new Error('network failed')):Promise.resolve({data:emptyMutation?[]:[{id:'phone',user_id:'sales'}],error:mutationError})).then(resolve,reject)}
    const data=table==='team_permissions'?permissions:table==='callcenter_profiles'?people:table==='callcenter_phone_numbers'?[{id:'phone',phone_number:'+17025550101',active,twilio_status:status,requested_by_user_id:'demo'}]:[{phone_number_id:'phone',user_id:'demo'}];
    const error=table==='team_permissions'&&failPermissions?{message:'permission lookup failed'}:table==='callcenter_phone_numbers'?phoneError:table==='callcenter_phone_assignments'?assignmentError:null;
    return Promise.resolve({data,error}).then(resolve,reject);
   }};return q;
 }};
 vm.runInNewContext(source,{document,window:{supabase:{},steadyHandsCRMClient:c},location:{reload(){reloads++}},alert:m=>alerts.push(m),confirm:()=>confirmResult,setTimeout:fn=>fn()});
 await handlers.DOMContentLoaded();
 return {main,select,handlers,writes,alerts,rpcCalls,controls,get reloads(){return reloads},get removed(){return removed},revoke(){permissions=[]},click:name=>handlers[name+':click'](),change:async(value)=>{select.value=value;await handlers['assignment:change']()},submit:async(number,label='')=>{controls.number.value=number;controls.label.value=label;await handlers['form:submit']({preventDefault(){},currentTarget:form})}};
}

test('selector includes eligible SALES and ADMIN profiles and preserves an unavailable assignment',async()=>{
 const {main}=await setup();
 const options=main.innerHTML.match(/<select data-phone-assignment>([\s\S]*?)<\/select>/)[1];
 assert.match(options,/Administrator/);assert.match(options,/Valid Sales — sales@example.com/);
 assert.match(options,/value="demo" selected disabled/);
 assert.doesNotMatch(options,/Inactive Sales|Hidden Sales|Disabled Sales|>Demo</);
});

test('revoked eligibility is rejected before any assignment write',async()=>{
 const s=await setup();s.revoke();await s.change('sales');
 assert.deepEqual(s.writes,[]);assert.deepEqual(s.rpcCalls,[]);
 assert.match(s.alerts[0],/not an active, listed sales associate/);
 assert.equal(s.select.value,'demo');assert.equal(s.select.disabled,false);
});

test('failed permission lookup does not fall back to all profiles',async()=>{
 const s=await setup({failPermissions:true});
 assert.match(s.main.innerHTML,/Could not verify active sales associates and admins/);
 assert.doesNotMatch(s.main.innerHTML,/<select data-phone-assignment>/);
});

for(const user of ['sales','admin','']) test(`assignment to ${user||'Unassigned'} uses one RPC with expected owner`,async()=>{
 const s=await setup();await s.change(user);
 assert.equal(s.rpcCalls.length,1);assert.equal(s.rpcCalls[0].name,'admin_assign_outbound_phone');
 assert.equal(s.rpcCalls[0].args.p_phone_number_id,'phone');
 assert.equal(s.rpcCalls[0].args.p_user_id,user||null);assert.equal(s.rpcCalls[0].args.p_expected_user_id,'demo');
 assert.deepEqual(s.writes,[]);assert.equal(s.reloads,1);
});

for(const error of [{message:'Assignment changed in another session'},{code:'PGRST202',message:'Missing function'}]) test(`RPC failure restores selection: ${error.message}`,async()=>{
 const s=await setup({rpcError:error});await s.change('sales');
 assert.equal(s.reloads,0);assert.equal(s.select.value,'demo');assert.equal(s.select.disabled,false);
 assert.deepEqual(s.writes,[]);assert.match(s.alerts[0],error.code?/sql\/admin-phone-assignment.sql/:/Assignment changed/);
});

for(const status of ['pending','ready']) test(`readiness toggle from ${status} never changes the requester or assignment`,async()=>{
 const s=await setup({status});await s.click('ready');
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].table,'callcenter_phone_numbers');
 assert.equal(s.writes[0].payload.twilio_status,status==='pending'?'ready':'pending');
 assert.deepEqual(s.rpcCalls,[]);assert.equal(s.reloads,1);
});

test('cancelled readiness and removal confirmations do not write',async()=>{
 const s=await setup({status:'pending',confirmResult:false});await s.click('ready');await s.click('delete');
 assert.deepEqual(s.writes,[]);assert.equal(s.reloads,0);
});

for(const active of [true,false]) test(`active toggle from ${active} updates one phone`,async()=>{
 const s=await setup({active});await s.click('toggle');
 assert.equal(s.writes[0].payload.active,!active);assert.equal(s.reloads,1);
 if(!active){assert.match(s.main.innerHTML,/>Disabled<\/span>/);assert.doesNotMatch(s.main.innerHTML,/Calls from .* use this number/)}
});

test('remove targets only the selected phone',async()=>{
 const s=await setup();await s.click('delete');
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].action,'delete');
 assert.deepEqual(s.writes[0].filters,[['eq','id','phone']]);assert.equal(s.reloads,1);
});

for(const kind of ['ready','toggle','delete','approve','reject']) for(const failure of ['emptyMutation','throwMutation','mutationError']) test(`${kind} handles ${failure} without false success`,async()=>{
 const s=await setup({[failure]:failure==='mutationError'?{message:'write denied'}:true});await s.click(kind);
 assert.equal(s.reloads,0);assert.equal(s.removed,false);assert.equal(s.controls[kind].disabled,false);assert.equal(s.alerts.length,1);
});

for(const action of ['approve','reject']) test(`${action} updates only a pending verified profile`,async()=>{
 const s=await setup();await s.click(action);
 assert.equal(s.writes[0].payload.phone_approval_status,action==='approve'?'approved':'rejected');
 assert.deepEqual(s.writes[0].filters,[['eq','user_id','sales'],['eq','phone_approval_status','pending'],['not','phone_verified_at','is',null]]);
 assert.equal(s.removed,true);
});

test('add normalizes domestic formatting and starts pending',async()=>{
 const s=await setup();await s.submit('(702) 555-0102',' Sales ');
 assert.equal(s.writes[0].payload.phone_number,'+17025550102');assert.equal(s.writes[0].payload.label,'Sales');
 assert.equal(s.writes[0].payload.twilio_status,'pending');assert.equal(s.reloads,1);
});

for(const number of ['123','(702) 555-0101']) test(`add rejects invalid or existing number: ${number}`,async()=>{
 const s=await setup();await s.submit(number);assert.deepEqual(s.writes,[]);assert.equal(s.alerts.length,1);
});

test('add recovers after a thrown network error',async()=>{
 const s=await setup({throwMutation:true});await s.submit('+17025550102');
 assert.equal(s.controls.submit.disabled,false);assert.equal(s.reloads,0);assert.match(s.alerts[0],/network failed/);
});

test('permission errors mentioning phone tables are not misreported as missing schema',async()=>{
 const s=await setup({phoneError:{code:'42501',message:'permission denied for callcenter_phone_numbers'}});
 assert.match(s.main.innerHTML,/permission denied/);assert.doesNotMatch(s.main.innerHTML,/Caller ID setup required/);
});

test('missing caller ID tables show setup instructions',async()=>{
 const s=await setup({phoneError:{code:'42P01',message:'missing relation'}});
 assert.match(s.main.innerHTML,/Caller ID setup required/);
});

test('signed-out page does not stay stuck loading',async()=>{
 const s=await setup({session:false});assert.match(s.main.innerHTML,/Admin access required/);
});
