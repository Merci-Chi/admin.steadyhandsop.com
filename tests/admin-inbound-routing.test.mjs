import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../admin-settings.js',import.meta.url),'utf8');
async function setup(){
 let admin=true;const handlers={},writes=[];
 const destination={value:'app',addEventListener:(event,fn)=>handlers.change=fn,closest:()=>card},forward={value:'',disabled:true},wrap={hidden:true},status={textContent:''};
 const save={disabled:false,addEventListener:(event,fn)=>handlers.save=fn,closest:()=>card};
 const card={dataset:{phoneId:'phone'},querySelector:selector=>({'[data-inbound-destination]':destination,'[data-inbound-forward]':forward,'[data-inbound-forward-wrap]':wrap,'[data-inbound-status]':status}[selector])};
 const main={innerHTML:'',querySelectorAll:selector=>selector==='[data-inbound-destination]'?[destination]:selector==='[data-save-inbound]'?[save]:[]};
 const c={auth:{getSession:async()=>({data:{session:{user:{id:'admin',email:'admin@example.com'}}}})},from(table){
  let patch=null;const q={select(){return q},eq(){return q},not(){return q},is(){return q},in(){return q},order(){return q},update(value){patch=value;return q},async maybeSingle(){return {data:{role:admin?'ADMIN':'SALES',active:true}}},then(resolve,reject){
   if(patch){writes.push({table,patch});return Promise.resolve({data:[{id:'phone'}]}).then(resolve,reject)}
   const data=table==='team_permissions'?[{user_id:'admin',role:'ADMIN',active:true}]:table==='callcenter_profiles'?[{user_id:'admin',display_name:'Admin'}]:table==='callcenter_phone_numbers'?[{id:'phone',phone_number:'+17025550101',active:true,twilio_status:'ready',inbound_destination:'app'}]:[{phone_number_id:'phone',user_id:'admin'}];
   return Promise.resolve({data}).then(resolve,reject);
  }};return q;
 }};
 const document={getElementById:id=>id==='adminSettingsContent'?main:null,addEventListener:(name,fn)=>handlers[name]=fn};
 vm.runInNewContext(source,{window:{supabase:{},steadyHandsCRMClient:c},document,location:{reload(){}},alert(){}});await handlers.DOMContentLoaded();
 return {main,handlers,destination,forward,wrap,status,save,writes,revoke:()=>admin=false};
}
test('Admin displays Outreach app as default and an explicit Phone forwarding option',async()=>{
 const s=await setup();assert.match(s.main.innerHTML,/value="app" selected>Outreach app/);assert.match(s.main.innerHTML,/>Phone forwarding</);assert.doesNotMatch(s.main.innerHTML,/>Regular call</);
 s.destination.value='forward';s.handlers.change();assert.equal(s.wrap.hidden,false);assert.equal(s.forward.disabled,false);
});
test('saving phone forwarding normalizes the number and updates only the chosen number',async()=>{
 const s=await setup();s.destination.value='forward';s.forward.value='(702) 555-0109';await s.handlers.save();
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].patch.inbound_destination,'forward');assert.equal(s.writes[0].patch.inbound_forward_number,'+17025550109');assert.match(s.status.textContent,/Press 1/);assert.equal(s.save.disabled,false);
});
test('returning to Outreach clears the forwarding destination',async()=>{
 const s=await setup();s.forward.value='+17025550109';await s.handlers.save();assert.equal(s.writes[0].patch.inbound_destination,'app');assert.equal(s.writes[0].patch.inbound_forward_number,null);
});
test('invalid or managed forwarding numbers and revoked Admin access cannot write',async()=>{
 for(const phone of ['bad','+17025550101','call 7025550109']){
  const s=await setup();s.destination.value='forward';s.forward.value=phone;await s.handlers.save();assert.equal(s.writes.length,0);assert.match(s.status.textContent,/Enter a phone number/);
 }
 const s=await setup();s.revoke();await s.handlers.save();assert.equal(s.writes.length,0);assert.match(s.status.textContent,/Admin access/);
});
