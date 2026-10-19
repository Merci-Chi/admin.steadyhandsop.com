import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const original=await readFile(new URL('../admin-leads.js',import.meta.url),'utf8');
const source=original.slice(0,original.indexOf("$('alAreaCode').addEventListener"))+
 `loadRows=async()=>window.reloads++;window.api={state,openAssignment};})();`;
function setup({people=[{user_id:'agent',display_name:'Agent',email:'agent@example.com'}],ids=[],error=null,empty=false}={}){
 const nodes=new Map(),writes=[],alerts=[];let lookups=0,eligible=true;
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,classList:{toggle(){}},
   querySelectorAll(selector){
    if(selector!=='[data-person]')return [];
    return [...this.innerHTML.matchAll(/data-person="([^"]*)"/g)].map(([,person])=>node('person:'+person));
   },dataset:{person:id.startsWith('person:')?id.slice(7):undefined}});
  return nodes.get(id);
 };
 const client={from(table){const req={};const q={
  select(){return q;},eq(){return q;},is(){return q;},or(){return q;},order(){return q;},
  in(key,value){if(key==='id')req.ids=value;return q;},
  range(start,end){req.range=[start,end];return q;},
  update(patch){req.patch=patch;return q;},
  then(resolve,reject){
   let result;
   if(table==='team_permissions'){lookups++;result={data:eligible?people.map(p=>({user_id:p.user_id,role:'SALES',active:true})):[]};}
   else if(table==='callcenter_profiles')result={data:people};
   else if(req.patch){writes.push(req);result=error?{error}:{data:empty?[]:req.ids.map(id=>({id}))};}
   else result={data:ids.slice(req.range[0],req.range[1]+1).map(id=>({id}))};
   return Promise.resolve(result).then(resolve,reject);
  }
 };return q;}};
 const window={steadyHandsCRMClient:client,reloads:0};
 vm.runInNewContext(source,{window,document:{getElementById:node},console:{error(){},warn(){}},alert:x=>alerts.push(x)});
 return {api:window.api,node,writes,alerts,window,get lookups(){return lookups},revoke(){eligible=false},
  choose(id){node('person:'+id).onclick();},submit(){return node('alConfirmAssign').onclick();}};
}
test('bulk Unassigned clears both ownership fields for leads belonging to any owner',async()=>{
 const s=setup();s.api.state.selected=new Set(['lead-owner-a','lead-owner-b','already-unassigned']);
 await s.api.openAssignment();assert.match(s.node('alAssignOptions').innerHTML,/Unassigned/);
 await s.submit();assert.equal(s.writes.length,0);
 s.choose('');assert.equal(s.node('alConfirmAssign').textContent,'Unassign Leads');await s.submit();
 assert.equal(s.writes.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(s.writes[0])),{patch:{assigned_user_id:null,assigned:''},ids:['lead-owner-a','lead-owner-b','already-unassigned']});
 assert.equal(s.api.state.selected.size,0);assert.equal(s.window.reloads,1);
 assert.deepEqual(s.alerts,['Unassigned 3 leads.']);
});
test('unassign remains available when no active salespeople exist',async()=>{
 const s=setup({people:[]});s.api.state.selected.add('lead');
 await s.api.openAssignment();s.choose('');await s.submit();
 assert.equal(s.lookups,1);assert.equal(s.writes[0].patch.assigned_user_id,null);
 assert.deepEqual(s.alerts,['Unassigned 1 leads.']);
});
test('unassign all matching updates every matching page in bounded batches',async()=>{
 const ids=Array.from({length:501},(_,i)=>'lead-'+i),s=setup({ids});
 Object.assign(s.api.state,{allMatching:true,total:ids.length,assignee:'agent'});
 await s.api.openAssignment();s.choose('');await s.submit();
 assert.deepEqual(s.writes.map(w=>w.ids.length),[250,250,1]);
 assert.deepEqual(Array.from(s.writes.flatMap(w=>Array.from(w.ids))),ids);
 assert(s.writes.every(w=>w.patch.assigned_user_id===null&&w.patch.assigned===''));
 assert.deepEqual(s.alerts,['Unassigned 501 leads.']);
});
test('assigning still verifies the active target and sets both ownership fields',async()=>{
 const s=setup();s.api.state.selected.add('lead');await s.api.openAssignment();s.choose('agent');await s.submit();
 assert.equal(s.lookups,2);assert.equal(s.writes[0].patch.assigned_user_id,'agent');assert.equal(s.writes[0].patch.assigned,'Agent');
 const revoked=setup();revoked.api.state.selected.add('lead');await revoked.api.openAssignment();revoked.choose('agent');revoked.revoke();await revoked.submit();
 assert.equal(revoked.writes.length,0);assert.match(revoked.node('alAssignStatus').textContent,/no longer active/);
});
for(const failure of [{error:{message:'Permission denied'}},{empty:true}])test('unassign errors never report success: '+JSON.stringify(failure),async()=>{
 const s=setup(failure);s.api.state.selected.add('lead');await s.api.openAssignment();s.choose('');await s.submit();
 assert.equal(s.alerts.length,0);assert.match(s.node('alAssignStatus').textContent,/Permission denied|Not every selected lead/);
 assert.equal(s.node('alConfirmAssign').disabled,false);assert.equal(s.node('alCancelAssign').disabled,false);
});
