import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const actionSource=await readFile(new URL('../performance-followup-actions.js',import.meta.url),'utf8');
const followupSource=await readFile(new URL('../performance-followups.js',import.meta.url),'utf8');
const original=await readFile(new URL('../admin-activity.js',import.meta.url),'utf8');
const source=original.slice(0,original.indexOf('  if(window.steadyHandsAdminSession)'))+'window.api={load,render,state,filtered};})();';
function setup({failFollowups=false,failCalls=false,requested=''}={}){
 const nodes=new Map(),requests=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',hidden:false,listeners:{},setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn}});return nodes.get(id)};
 const now=new Date();now.setHours(12,0,0,0);
 const calls=Array.from({length:1105},(_,i)=>({id:i,user_id:i%2?'kiara':'omar',crm_id:'lead',created_at:now.toISOString(),duration_seconds:60,outcome:i%2?'Interested':'Not interested'}));
 const followups=[{id:'f1',company:'Followup business',callback_owner_id:'kiara',callbackdate:'2026-11-01',stage:'callback'}];
 const client={from(table){const req={table,filters:[]};const q={select(){return q},order(){return q},eq(k,v){req.filters.push([k,v]);return q},in(k,v){req.ids=v;return q},range(a,b){req.range=[a,b];return q},then(resolve,reject){requests.push(req);if((table==='crm'&&req.filters.length&&failFollowups)||(table==='callcenter_call_activity'&&failCalls))return Promise.resolve({error:{message:'Unavailable'}}).then(resolve,reject);let data=table==='callcenter_call_activity'?calls:table==='callcenter_profiles'?[{user_id:'kiara',display_name:'Kiara'},{user_id:'omar',display_name:'Omar'},{user_id:'zero',display_name:'No Calls'}]:table==='callcenter_transcripts'?[{id:'t',call_activity_id:1}]:req.filters.length?followups:[{id:'lead',company:'Example business',phone:'555-0100'}];if(req.range)data=data.slice(req.range[0],req.range[1]+1);return Promise.resolve({data}).then(resolve,reject)}};return q}};
 const window={steadyHandsCRMClient:client};
 const location={search:requested?'?user='+requested:'',href:'https://example.test/activity.html',reload(){}};
 const history={replaceState(_a,_b,url){location.search=url.search;location.href=url.href}};
 vm.runInNewContext(actionSource,{window});vm.runInNewContext(followupSource,{window});
 vm.runInNewContext(source,{window,document:{getElementById:node,querySelector:()=>node('h1')},location,history,URL,URLSearchParams,console});
 return {api:window.api,node,requests,location};
}
test('loads every page and shows complete metrics and searchable history',async()=>{
 const s=setup();await s.api.load();assert.equal(s.api.state.rows.length,1105);
 assert.deepEqual(s.requests.filter(r=>r.table==='callcenter_call_activity').map(r=>r.range),[[0,499],[500,999],[1000,1499],[1105,1604]]);
 assert.match(s.node('adminActivitySummary').innerHTML,/<strong>1105<\/strong>/);
 assert.match(s.node('adminActivitySummary').innerHTML,/<strong>552<\/strong>/);
 assert.match(s.node('adminActivitySummary').innerHTML,/<strong>50%<\/strong>/);
 assert.equal(s.node('adminActivityCount').textContent,'100 of 1105');assert.equal(s.node('performanceMoreCalls').hidden,false);
 assert.match(s.node('adminActivityList').innerHTML,/Example business/);assert.match(s.node('performanceFollowups').innerHTML,/Followup business/);
 s.api.state.q='555-0100';assert.equal(s.api.filtered().length,1105);
});
test('individual selection updates title, metrics, calls, followups and shareable URL; switching back restores team',async()=>{
 const s=setup({requested:'kiara'});await s.api.load();
 assert.equal(s.node('performanceTitle').textContent,"Kiara's Performance");assert.match(s.node('adminActivitySummary').innerHTML,/<strong>100%<\/strong>/);
 assert.equal(s.node('adminActivityCount').textContent,'100 of 552');assert.equal(s.node('performanceFollowupCount').textContent,'1 of 1');
 s.node('adminActivityUserFilter').listeners.change({target:{value:'omar'}});
 assert.equal(s.node('h1').textContent,"Omar's Performance");assert.equal(s.node('performanceFollowupCount').textContent,'0 of 0');assert.equal(s.location.search,'?user=omar');
 s.node('adminActivityUserFilter').listeners.change({target:{value:''}});assert.equal(s.node('h1').textContent,'Team Performance');assert.equal(s.location.search,'');
});
test('zero-activity associate gets zero metrics and empty lists',async()=>{
 const s=setup({requested:'zero'});await s.api.load();assert.equal(s.node('performanceTitle').textContent,"No Calls's Performance");assert.match(s.node('adminActivitySummary').innerHTML,/<strong>0%<\/strong>/);assert.match(s.node('adminActivityList').innerHTML,/No calls match/);assert.match(s.node('performanceFollowups').innerHTML,/No follow-ups scheduled/);
});
test('followup failure is reported independently while calls and metrics remain available',async()=>{
 const s=setup({failFollowups:true});await s.api.load();assert.match(s.node('performanceFollowups').innerHTML,/Unable to load follow-ups/);assert.match(s.node('adminActivityList').innerHTML,/Example business/);assert.match(s.node('adminActivitySummary').innerHTML,/<strong>1105<\/strong>/);
});
test('call failures display an error instead of misleading zero metrics',async()=>{
 const s=setup({failCalls:true});await s.api.load();assert.match(s.node('adminActivitySummary').innerHTML,/unavailable/);assert.match(s.node('adminActivityList').innerHTML,/Unable to load performance/);
});
test('weekly metrics exclude old calls and did-not-call outcomes; chart counts agree',async()=>{
 const s=setup();await s.api.load();const today=new Date().toISOString();
 s.api.state.rows=[{id:1,user_id:'kiara',created_at:today,outcome:"Didn't Call",duration_seconds:0},{id:2,user_id:'kiara',created_at:today,outcome:'Not interested',duration_seconds:60},{id:3,user_id:'kiara',created_at:today,outcome:'Requested email',duration_seconds:120},{id:4,user_id:'kiara',created_at:'2020-01-01',outcome:'Sold',duration_seconds:999}];
 s.api.render();assert.match(s.node('adminActivitySummary').innerHTML,/<strong>2<\/strong>/);assert.match(s.node('adminActivitySummary').innerHTML,/<strong>1<\/strong>/);assert.match(s.node('adminActivitySummary').innerHTML,/<strong>50%<\/strong>/);assert.match(s.node('adminActivitySummary').innerHTML,/<strong>1m 30s<\/strong>/);assert.match(s.node('performanceChart').innerHTML,/<span>2<\/span>/);assert.equal(s.node('adminActivityCount').textContent,'4 of 4');
});
test('follow-up cards reuse call details, transcript and delete controls and add calendar/task actions',async()=>{
 const s=setup();await s.api.load();s.api.state.followups=[{id:'lead',company:'Spiderwash',callback_owner_id:'kiara',call:s.api.state.rows.find(r=>r.id===1)}];s.api.render();
 const html=s.node('performanceFollowups').innerHTML;assert.match(html,/class="admin-activity-row"/);assert.match(html,/href="call.html\?id=1"/);assert.match(html,/Transcript/);assert.match(html,/data-delete-call-id="1"/);assert.match(html,/Add to calendar/);assert.match(html,/Add to tasks/);
});
