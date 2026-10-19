import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../admin-settings.js',import.meta.url),'utf8');
async function setup({greeting='Existing <greeting>',schemaError=null,rpcError=null}={}) {
 let admin=true;const handlers={},calls=[];
 const input={value:greeting,disabled:false},status={textContent:''};
 const button={disabled:false,closest:()=>card,addEventListener:(_,fn)=>handlers.save=fn};
 const card={dataset:{phoneId:'phone'},querySelector:s=>({'[data-voicemail-greeting]':input,'[data-voicemail-status]':status}[s])};
 const main={innerHTML:'',querySelectorAll:s=>s==='[data-save-voicemail]'&&!schemaError?[button]:[]};
 const c={auth:{getSession:async()=>({data:{session:{user:{id:'admin'}}}})},
  async rpc(name,args){calls.push({name,args});return {error:rpcError};},
  from(table){let columns='';const q={select:s=>(columns=s,q),eq:()=>q,in:()=>q,is:()=>q,not:()=>q,order:()=>q,
   maybeSingle:async()=>({data:{role:admin?'ADMIN':'SALES',active:true}}),
   then(resolve,reject){return Promise.resolve({data:table==='team_permissions'?[{user_id:'admin',role:'ADMIN',active:true}]:table==='callcenter_profiles'?[{user_id:'admin',display_name:'Admin'}]:table==='callcenter_phone_numbers'?[{id:'phone',phone_number:'+17025550101',active:true,twilio_status:'ready',voicemail_greeting:greeting}]:[],error:columns==='id,voicemail_greeting'?schemaError:null}).then(resolve,reject);}
  };return q;}
 };
 const document={getElementById:id=>id==='adminSettingsContent'?main:null,addEventListener:(name,fn)=>handlers[name]=fn};
 vm.runInNewContext(source,{window:{supabase:{},steadyHandsCRMClient:c},document,location:{reload(){}},alert(){}});
 await handlers.DOMContentLoaded();return {main,input,status,button,calls,save:()=>handlers.save(),revoke:()=>admin=false};
}
test('number card escapes saved text and offers an Admin voicemail editor',async()=>{
 const s=await setup();assert.match(s.main.innerHTML,/Existing &lt;greeting&gt;/);assert.match(s.main.innerHTML,/Save voicemail greeting/);
 const empty=await setup({greeting:''});assert.match(empty.main.innerHTML,/\(702\) 775-9756/);
});
test('save uses the selected number and trims the greeting',async()=>{
 const s=await setup();s.input.value=' New greeting ';const pending=s.save();await s.save();await pending;
 assert.equal(s.calls.length,1);assert.equal(s.calls[0].name,'admin_set_phone_voicemail');assert.equal(s.calls[0].args.p_phone_number_id,'phone');assert.equal(s.calls[0].args.p_greeting,'New greeting');assert.equal(s.input.value,'New greeting');assert.equal(s.status.textContent,'Voicemail greeting saved.');assert.equal(s.button.disabled,false);
});
test('blank, oversized and revoked-admin edits do not submit',async()=>{
 for(const value of ['   ','x'.repeat(501)]){const s=await setup();s.input.value=value;await s.save();assert.equal(s.calls.length,0);assert.match(s.status.textContent,/between 1 and 500/);}
 const s=await setup();s.revoke();await s.save();assert.equal(s.calls.length,0);assert.match(s.status.textContent,/Admin access/);
});
test('missing migration leaves other phone controls available',async()=>{
 const s=await setup({schemaError:{code:'42703',message:'missing voicemail_greeting'}});assert.match(s.main.innerHTML,/sql\/admin-phone-voicemail.sql/);assert.match(s.main.innerHTML,/data-save-inbound/);assert.doesNotMatch(s.main.innerHTML,/data-save-voicemail/);
});
for(const error of [{code:'PGRST202',message:'missing RPC'},{message:'write denied'}])test('save errors restore controls and never report success: '+error.message,async()=>{
 const s=await setup({rpcError:error});await s.save();assert.equal(s.button.disabled,false);assert.equal(s.input.disabled,false);assert.doesNotMatch(s.status.textContent,/saved\./);assert.match(s.status.textContent,error.code?/sql\/admin-phone-voicemail.sql/:/write denied/);
});
