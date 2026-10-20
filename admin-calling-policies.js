(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const box=$('adminCallingForm');if(!box)return;
 const client=()=>window.steadyHandsCRMClient;
 let policyByUser=new Map();
 const msg=$('policyResult');
 function showMode(){$('policyDelayFields').hidden=$('policyMode').value!=='delayed';}
 function fillPolicy(){
  const policy=policyByUser.get($('policyAssociate').value);
  $('policyMode').value=policy?.mode||'normal';
  $('policyMin').value=policy?.delay_min??7;
  $('policyMax').value=policy?.delay_max??45;
  $('policyBias').value=policy?.slow_bias||'high';
  showMode();
  msg.textContent='';
 }
 async function init(){
  const c=client();if(!c)return;
  try {
   const [users,perms,policies]=await Promise.all([
    c.from('callcenter_profiles').select('user_id,display_name,email').order('display_name'),
    c.from('team_permissions').select('user_id,role'),
    c.from('associate_calling_policies').select('user_id,mode,delay_min,delay_max,slow_bias')
   ]);
   for(const result of [users,perms,policies])if(result.error)throw result.error;
   const sales=new Set((perms.data||[]).filter(p=>p.role==='SALES').map(p=>String(p.user_id)));
   const select=$('policyAssociate');
   select.replaceChildren(new Option('Select a sales associate',''));
   for(const user of users.data||[]){
    if(sales.has(String(user.user_id)))select.add(new Option(user.display_name||user.email||'Associate',user.user_id));
   }
   policyByUser=new Map((policies.data||[]).map(p=>[String(p.user_id),p]));
   fillPolicy();
  }catch(error){msg.textContent='Calling policy settings unavailable: '+(error.message||error);}
 }
 $('policyAssociate').addEventListener('change',fillPolicy);
 $('policyMode').addEventListener('change',showMode);
 box.addEventListener('submit',async event=>{
  event.preventDefault();
  const userId=$('policyAssociate').value,mode=$('policyMode').value,
   min=Number($('policyMin').value),max=Number($('policyMax').value),bias=$('policyBias').value;
  if(!userId)return;
  if(!Number.isInteger(min)||!Number.isInteger(max)||min<7||max>45||min>max){msg.textContent='Choose a valid 7–45 second range.';return;}
  if(!confirm('Apply '+mode+' calling policy to this associate?'))return;
  const btn=box.querySelector('[type=submit]');btn.disabled=true;msg.textContent='Saving…';
  try {
   const {error}=await client().rpc('admin_set_calling_policy',{p_user_id:userId,p_mode:mode,p_min:min,p_max:max,p_bias:bias});
   if(error)throw error;
   policyByUser.set(userId,{mode,delay_min:min,delay_max:max,slow_bias:bias});
   msg.textContent='Calling policy saved. The next outbound call will use the new setting.';
  }catch(error){msg.textContent='Could not save: '+(error.message||error);}
  finally{btn.disabled=false;}
 });
 if(client())init();else window.addEventListener('steadyhands:admin-ready',init,{once:true});
})();
