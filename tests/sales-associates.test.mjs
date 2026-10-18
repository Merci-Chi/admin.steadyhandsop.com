import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
function utilities(){const window={};vm.runInNewContext(read('sales-associate-data.js'),{window});return window.SalesAssociateData;}
test('overview omits missing fields and empty sections, preserving real zero and false values',()=>{
 const d=utilities();const html=d.section('Profile',{Name:'Ada',Country:null,Province:' ',State:'null',Empty:{nested:null},Missing:[],Calls:0,Consent:false,Notes:'<script>alert(1)</script>',access_token:'SECRET'});
 assert.match(html,/>Ada</);assert.match(html,/>0</);assert.match(html,/>No</);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/Country|Province|State|Empty|Missing|SECRET|No data|Not provided/);
 assert.equal(d.section('Empty',{x:null,y:[],z:{a:''}}),'');
});
test('all-page reader continues past server response caps without truncation',async()=>{
 const d=utilities(),rows=Array.from({length:1251},(_,i)=>({id:i})),ranges=[];
 const client={from:()=>({select(){return this},order(){return this},async range(a,b){ranges.push([a,b]);return {data:rows.slice(a,Math.min(b+1,a+100))};}})};
 const result=await d.readAll(client,'example');assert.equal(result.length,1251);assert.equal(new Set(result.map(x=>x.id)).size,1251);assert.equal(ranges.at(-1)[0],1251);
});
test('Sales Associates dropdown is first and contains all four pages on desktop and mobile',()=>{
 const elements=[];const document={readyState:'complete',head:{appendChild(el){elements.push(el)}},body:{firstChild:null,classList:{add(){}},insertBefore(el){elements.push(el)}},title:'',getElementById:()=>null,
 querySelector(selector){return selector==='.admin-mobile-menu'?{}:null},querySelectorAll:()=>[],createElement(tag){return {tag,setAttribute(){},innerHTML:''};}};
 vm.runInNewContext(read('admin-shell.js'),{document,location:{pathname:'/other-actions.html'},window:{}});
 const html=elements.find(x=>x.className==='admin-desktop-sidebar').innerHTML;
 assert(html.indexOf('Sales Associates')<html.indexOf('href="index.html"'));
 for(const href of ['admin.html','onboarding.html','agreement-actions.html','other-actions.html'])assert.match(html,new RegExp('href="'+href+'"'));
 assert.match(html,/<details class="admin-associates-group" open>/);assert.match(html,/href="other-actions.html" aria-current="page"/);assert.doesNotMatch(html,/>Salespeople</);
});
function outcomes({failLoad=false,failAssign=false,verified=true}={}){
 const nodes=new Map(),listeners={},calls=[];
 function node(id){if(!nodes.has(id))nodes.set(id,{value:id==='oa-filter'?'all':'',dataset:{},disabled:false,innerHTML:'',textContent:'',listeners:{},addEventListener(event,fn){this.listeners[event]=fn},reportValidity(){return true;}});return nodes.get(id);}
 const tables={callcenter_profiles:[{user_id:'a',display_name:'Ada',email:'ada@example.com'},{user_id:'b',display_name:'Bea',email:'bea@example.com'}],team_permissions:[],outreach_associates:[{user_id:'a',current_basis:'hourly',start_date:'2026-11-02'},{user_id:'b',current_basis:'hourly',start_date:'2026-11-09'}],outreach_action_assignments:[{id:'assignment-a',user_id:'a',status:'assigned',assigned_at:'2026-10-18T10:00:00Z'},{id:'assignment-b',user_id:'b',status:'completed'}],outreach_action_preferences:[{user_id:'b',selected_path:'commission',commission_agreement_requested:true,local_timezone:'America/New_York',work_timezone:'America/Chicago',shift_start_minutes:540,preferred_weekly_hours:20}],outreach_start_date_history:[{user_id:'a',id:'change-a',previous_start_date:'2026-10-26',new_start_date:'2026-11-02'}]};
 const window={SalesAssociateData:utilities(),addEventListener(type,fn){listeners[type]=fn},steadyHandsCRMClient:{from(table){return {select(){return this},order(){return this},async range(a,b){return failLoad?{error:{message:'relation does not exist'}}:{data:tables[table].slice(a,b+1)};}}},async rpc(name,args){calls.push({name,args});if(name==='sh_admin_agreement_actions')return {data:{users:[{id:'c',name:'Cam',email:'cam@example.com'}]}};return failAssign?{error:{message:'Permission revoked'}}:{data:'new-assignment'};}}};
 if(verified)window.steadyHandsAdminSession={};
 vm.runInNewContext(read('other-actions.js'),{document:{getElementById:node},window,location:{search:''},URLSearchParams,Date,confirm:()=>true});
 return {node,calls,listeners,settle:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('outcomes wait for verified admin access and then show every recorded outcome',async()=>{
 const h=outcomes({verified:false});await h.settle();assert.equal(h.calls.length,0);await h.listeners['steadyhands:admin-ready']();await h.settle();assert.match(h.node('oa-results').innerHTML,/Ada/);assert.match(h.node('oa-results').innerHTML,/Bea/);assert.match(h.node('oa-results').innerHTML,/Commission agreement requested/i);assert.match(h.node('oa-results').innerHTML,/2026-10-26/);
});
test('outcome filters distinguish agreement requests and start-date changes',async()=>{
 const h=outcomes();await h.settle();h.node('oa-filter').value='commission-request';h.node('oa-filter').listeners.change();assert.match(h.node('oa-results').innerHTML,/Bea/);assert.doesNotMatch(h.node('oa-results').innerHTML,/Ada/);
 h.node('oa-filter').value='date-changed';h.node('oa-filter').listeners.change();assert.match(h.node('oa-results').innerHTML,/Ada/);assert.doesNotMatch(h.node('oa-results').innerHTML,/Bea/);
});
test('assignment sends the selected user and actual agreement/date to the protected RPC',async()=>{
 const h=outcomes();await h.settle();h.node('oa-user').value='c';h.node('oa-basis').value='hourly';h.node('oa-date').value='2026-11-02';await h.node('oa-form').listeners.submit({preventDefault(){}});
 const call=h.calls.find(x=>x.name==='outreach_admin_assign_action');assert.equal(call.args.p_user_id,'c');assert.equal(call.args.p_current_basis,'hourly');assert.equal(call.args.p_start_date,'2026-11-02');assert.match(h.node('oa-message').textContent,/Questionnaire assigned/);
});
test('failed assignment and missing schema never display success or an empty result as valid data',async()=>{
 const h=outcomes({failAssign:true});await h.settle();h.node('oa-user').value='c';h.node('oa-basis').value='commission';await h.node('oa-form').listeners.submit({preventDefault(){}});assert.match(h.node('oa-message').textContent,/not confirmed.*Permission revoked/);assert.doesNotMatch(h.node('oa-message').textContent,/Questionnaire assigned/);
 const missing=outcomes({failLoad:true});await missing.settle();assert.match(missing.node('oa-notice').textContent,/Could not load actions/);assert(missing.node('oa-assign').disabled);assert.equal(missing.node('oa-results').innerHTML,'');
});
