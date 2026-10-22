import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../associate-calling-access.js',import.meta.url),'utf8');
function setup({mode='normal',readError=null,saveError=null}={}){
 let open,panel;const calls=[];
 const status={textContent:''},button={disabled:true,setAttribute(k,v){this[k]=v}};
 const drawer={dataset:{userId:'user'},querySelector:()=>({before(node){panel=node}})};
 const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{mode,delay_min:9,delay_max:30,slow_bias:'even'},error:readError})})})}),rpc:async(name,args)=>{calls.push({name,args});return {error:saveError}}};
 vm.runInNewContext(source,{window:{steadyHandsCRMClient:client,addEventListener(_name,fn){open=fn}},document:{getElementById:()=>drawer,createElement:()=>({isConnected:true,querySelector:s=>s==='button'?button:status})}});
 return {open:()=>open({detail:{userId:'user'}}),status,button,calls,drawer};
}
test('overview reads saved policy and toggles calling access through the admin RPC',async()=>{
 const h=setup();await h.open();assert.equal(h.button.disabled,false);
 await h.button.onclick();assert.equal(h.calls[0].name,'admin_set_calling_policy');assert.equal(h.calls[0].args.p_mode,'restricted');assert.equal(h.calls[0].args.p_min,9);
 assert.match(h.status.textContent,/Leads hidden/);assert.equal(h.button.textContent,'Unblock Calling');
 await h.button.onclick();assert.equal(h.calls[1].args.p_mode,'normal');assert.equal(h.button.textContent,'Block from Calling');
});
test('unavailable policy stays disabled and failed save does not claim success',async()=>{
 const read=setup({readError:{message:'offline'}});await read.open();assert.equal(read.button.disabled,true);assert.match(read.status.textContent,/offline/);
 const save=setup({mode:'restricted',saveError:{message:'denied'}});await save.open();await save.button.onclick();assert.match(save.status.textContent,/denied/);assert.equal(save.button.textContent,'Unblock Calling');
});
