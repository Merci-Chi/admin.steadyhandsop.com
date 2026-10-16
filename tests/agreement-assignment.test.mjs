import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('assigns through existing issuer and shows account-based confirmation',async()=>{
 const nodes=new Map();
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',style:{},hidden:true,innerHTML:'',textContent:'',listeners:{},
   addEventListener(event,handler){this.listeners[event]=handler},querySelectorAll:()=>[],reset(){}});
  return nodes.get(id);
 };
 const calls=[];
 const window={addEventListener(){},steadyHandsCRMClient:{rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='sh_admin_issue_agreement_action_v2')return {data:{code:'internalReference123'}};
  if(name==='sh_admin_agreement_actions')return {data:{users:[],actions:[{code:'internalReference123',email:'associate@example.com',document_key:'trial-hourly',status:'pending'}]}};
  return {error:{message:'Function not found'}};
 }}};
 const context={document:{getElementById:node},window};
 vm.runInNewContext(await readFile(new URL('../agreement-actions.js',import.meta.url),'utf8'),context);
 node('aa-user').value='assigned-user';node('aa-document').value='trial-hourly';
 node('aa-effective').value='2026-10-19';node('aa-location').value='Nevada';
 const button={disabled:false};
 await node('aa-create').listeners.submit({preventDefault(){},submitter:button});
 assert.equal(calls[0].name,'sh_admin_issue_agreement_action_v2');
 assert.equal(calls[0].args.p_user_id,'assigned-user');
 assert.equal(calls[0].args.p_associate_name,'Awaiting associate entry');
 assert.equal(calls[0].args.p_effective_date,'2026-10-19');
 assert.equal(button.disabled,false);
 assert.equal(node('aa-generated').hidden,false);
 assert.match(node('aa-generated').innerHTML,/Agreement assigned/);
 assert.match(node('aa-generated').innerHTML,/sign in to onboarding/);
 assert.doesNotMatch(node('aa-generated').innerHTML,/internalReference123|passcode/i);
 assert.doesNotMatch(node('aa-list').innerHTML,/>internalReference123<|Copy code/);
 assert(!nodes.has('aa-legal-name'));
});
