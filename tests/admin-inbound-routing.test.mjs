import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../admin-settings.js',import.meta.url),'utf8');
async function setup({schemaError=null, fallbackError=null, mutationError=null, emptyMutation=false, beforeWrite=null, extraNumbers=[]}={}){
 let admin=true;const handlers={},writes=[];
 const destination={value:'app',addEventListener:(event,fn)=>handlers.change=fn,closest:()=>card},forward={value:'',disabled:true},wrap={hidden:true},status={textContent:''};
 const save={disabled:false,addEventListener:(event,fn)=>handlers.save=fn,closest:()=>card};
 const card={dataset:{phoneId:'phone'},querySelector:selector=>({'[data-inbound-destination]':destination,'[data-inbound-forward]':forward,'[data-inbound-forward-wrap]':wrap,'[data-inbound-status]':status}[selector])};
 const main={innerHTML:'',querySelectorAll:selector=>selector==='[data-inbound-destination]'?[destination]:selector==='[data-save-inbound]'?[save]:[]};
 const c={auth:{getSession:async()=>({data:{session:{user:{id:'admin',email:'admin@example.com'}}}})},from(table){
  let patch=null, columns='';const q={select(value){columns=value;return q},eq(){return q},not(){return q},is(){return q},in(){return q},order(){return q},update(value){patch=value;return q},async maybeSingle(){return {data:{role:admin?'ADMIN':'SALES',active:true}}},then(resolve,reject){
   if(patch){writes.push({table,patch});beforeWrite?.({destination,forward,save});return Promise.resolve({data:emptyMutation?[]:[{id:'phone'}],error:mutationError}).then(resolve,reject)}
   const data=table==='team_permissions'?[{user_id:'admin',role:'ADMIN',active:true}]:table==='callcenter_profiles'?[{user_id:'admin',display_name:'Admin'}]:table==='callcenter_phone_numbers'?[{id:'phone',phone_number:'+17025550101',active:true,twilio_status:'ready',inbound_destination:'app'},...extraNumbers]:[{phone_number_id:'phone',user_id:'admin'}];
   const error=table==='callcenter_phone_numbers'?(columns.includes('inbound_destination')?schemaError:fallbackError):null;
   return Promise.resolve({data,error}).then(resolve,reject);
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
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].patch.inbound_destination,'forward');assert.equal(s.writes[0].patch.inbound_forward_number,'+17025550109');assert.match(s.status.textContent,/press 1/i);assert.equal(s.save.disabled,false);
});
test('returning to Outreach clears the forwarding destination',async()=>{
 const s=await setup();s.forward.value='+17025550109';await s.handlers.save();assert.equal(s.writes[0].patch.inbound_destination,'app');assert.equal(s.writes[0].patch.inbound_forward_number,null);
});
test('invalid forwarding numbers and revoked Admin access cannot write',async()=>{
 for(const phone of ['bad','call 7025550109']){
  const s=await setup();s.destination.value='forward';s.forward.value=phone;await s.handlers.save();assert.equal(s.writes.length,0);assert.match(s.status.textContent,/Enter a valid phone number/);
 }
 const s=await setup();s.revoke();await s.handlers.save();assert.equal(s.writes.length,0);assert.match(s.status.textContent,/Admin access/);
});
test('managed destinations are accepted and normalized',async()=>{
 const s=await setup({extraNumbers:[{id:'kiara',phone_number:'+17023726399',inbound_destination:'app'}]});
 s.destination.value='forward';s.forward.value='7023726399';await s.handlers.save();
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].patch.inbound_forward_number,'+17023726399');assert.equal(s.forward.value,'+17023726399');
});
test('self-forwarding and managed forwarding cycles cannot write',async()=>{
 for(const target of ['+17025550101','+17025550108']){
  const s=await setup({extraNumbers:[{id:'other',phone_number:'+17025550108',inbound_destination:'forward',inbound_forward_number:'+17025550101'}]});
  s.destination.value='forward';s.forward.value=target;await s.handlers.save();assert.equal(s.writes.length,0);assert.match(s.status.textContent,/loop/);
 }
});

test('phone page loads the controller once and renders one section heading',async()=>{
 const html=await readFile(new URL('../phones.html',import.meta.url),'utf8');
 assert.equal([...html.matchAll(/<script\b[^>]*src="admin-settings\.js[^"]*"/g)].length,1);
 const s=await setup();assert.equal([...s.main.innerHTML.matchAll(/<h2>Calling Numbers<\/h2>/g)].length,1);
 assert.doesNotMatch(s.main.innerHTML,/<h2>Outbound Phone Numbers/);
});
for(const code of ['42703','PGRST204']) test(`missing routing columns preserve existing controls (${code})`,async()=>{
 const s=await setup({schemaError:{code,message:'column inbound_destination does not exist'}});
 assert.match(s.main.innerHTML,/Incoming routing setup required/);
 assert.match(s.main.innerHTML,/data-phone-assignment/);assert.match(s.main.innerHTML,/data-phone-ready/);
 assert.match(s.main.innerHTML,/Pending Approvals/);assert.doesNotMatch(s.main.innerHTML,/data-save-inbound/);
});
test('a failed fallback reports the database error instead of displaying empty phone management',async()=>{
 const s=await setup({schemaError:{code:'42703',message:'column inbound_forward_number does not exist'},fallbackError:{code:'42501',message:'permission denied'}});
 assert.match(s.main.innerHTML,/permission denied/);assert.doesNotMatch(s.main.innerHTML,/data-phone-assignment/);
});
test('unrelated schema errors are not hidden by a routing fallback',async()=>{
 const s=await setup({schemaError:{code:'42703',message:'column created_at does not exist'}});
 assert.match(s.main.innerHTML,/column created_at does not exist/);assert.doesNotMatch(s.main.innerHTML,/data-phone-assignment/);
});
for(const failure of [{emptyMutation:true},{mutationError:{message:'write denied'}}]) test('failed routing save does not report success and restores inputs',async()=>{
 const s=await setup(failure);await s.handlers.save();
 assert.doesNotMatch(s.status.textContent,/Incoming calls will ring/);assert.equal(s.save.disabled,false);assert.equal(s.destination.disabled,false);assert.equal(s.forward.disabled,true);
});
test('routing inputs stay disabled during the save and duplicate clicks do not submit',async()=>{
 let locked=false;const s=await setup({beforeWrite:({destination,forward,save})=>{locked=destination.disabled&&forward.disabled&&save.disabled;}});
 const pending=s.handlers.save();await s.handlers.save();await pending;
 assert.equal(locked,true);assert.equal(s.writes.length,1);assert.equal(s.destination.disabled,false);
});

