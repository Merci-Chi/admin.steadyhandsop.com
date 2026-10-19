import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const original=await readFile(new URL('../admin-dashboard.js',import.meta.url),'utf8');
const source=original.slice(0,original.indexOf('if(window.steadyHandsAdminSession)'))+'window.api={load};})();';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function setup(){
 const nodes=new Map(),requests=[],details=deferred(),count=deferred(),timers=new Set();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',disabled:false,closest(){return {querySelector(){return node('leadTotal')}}}});return nodes.get(id)};
 const client={from(table){const req={table};const q={
  select(fields,options){Object.assign(req,{fields,options});return q},order(){return q},limit(){return q},
  in(key,ids){req.ids=ids;return q},abortSignal(signal){req.signal=signal;return q},
  then(resolve,reject){requests.push(req);let result;
   if(table==='crm')result=req.options?.count?count.promise:details.promise;
   else if(table==='callcenter_profiles')result={data:[{user_id:'agent',display_name:'Agent'}]};
   else if(table==='team_permissions')result={data:[{user_id:'agent',role:'ADMIN',active:true}]};
   else if(table==='callcenter_call_activity')result={data:Array.from({length:9},(_,i)=>({id:i,user_id:'agent',crm_id:'lead-'+i,created_at:'2026-10-19'}))};
   else result={data:[]};
   return Promise.resolve(result).then(resolve,reject);
  }
 };return q}};
 const window={steadyHandsCRMClient:client};
 vm.runInNewContext(source,{window,document:{getElementById:node,querySelector:node},console:{error(){},warn(){}},AbortController,
  setTimeout(fn,ms){const timer={fn,ms};timers.add(timer);return timer},clearTimeout:timer=>timers.delete(timer)});
 return {api:window.api,node,requests,details,count,timers};
}
test('overview renders while CRM requests are pending and fetches only seven recent leads',async()=>{
 const s=setup();await s.api.load();
 assert.match(s.node('adminMetricGrid').innerHTML,/Active users/);assert.match(s.node('adminRecentUsers').innerHTML,/Agent/);
 assert.match(s.node('adminRecentCalls').innerHTML,/Unknown lead/);
 const crm=s.requests.filter(r=>r.table==='crm');assert.equal(crm.length,1);assert.equal(crm[0].ids.length,7);assert.equal(crm[0].options,undefined);
 s.details.resolve({data:[{id:'lead-0',company:'Matched business'}]});await new Promise(r=>setImmediate(r));
 assert.match(s.node('adminRecentCalls').innerHTML,/Matched business/);
});
test('CRM count runs only on request and cannot block the rest of the overview',async()=>{
 const s=setup();await s.api.load();const button=s.node('adminLoadLeadTotal');
 const pending=button.onclick();await Promise.resolve();assert(button.disabled);
 const counts=s.requests.filter(r=>r.options?.count==='exact');assert.equal(counts.length,1);assert.equal(counts[0].options.head,true);
 assert.match(s.node('adminMetricGrid').innerHTML,/Calls today/);
 s.count.resolve({count:215148});await pending;
 assert.equal(s.node('leadTotal').textContent,'215,148');assert.equal(button.disabled,false);assert.equal(button.textContent,'Refresh total');
});
test('failed count leaves all dashboard sections visible and offers retry',async()=>{
 const s=setup();await s.api.load();const pending=s.node('adminLoadLeadTotal').onclick();
 s.count.resolve({error:{message:'Statement timeout'}});await pending;
 assert.equal(s.node('adminLoadLeadTotal').textContent,'Retry total');assert.match(s.node('adminMetricGrid').innerHTML,/Active users/);
 assert.match(s.node('adminRecentUsers').innerHTML,/Agent/);
});
