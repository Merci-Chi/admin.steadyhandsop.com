/* Permission toggle in the existing Sales Associate > Overview drawer. */
(() => {
 'use strict';
 let generation=0;
 window.addEventListener('steadyhands:associate-open', async ({detail}) => {
  const ticket=++generation, userId=detail.userId;
  const drawer=document.getElementById('adminUserDrawer');
  if(!drawer)return;
  const section=document.createElement('section');
  section.className='sa-section';
  section.innerHTML='<h3>Team performance access</h3><p>Allow this associate to view the full team\'s read-only performance report in Outreach. This does not grant admin access.</p><label style="display:flex;align-items:center;gap:10px;margin:12px 0"><input type="checkbox" id="teamPerformanceAllowed" disabled> Can view full team performance</label><p id="teamPerformanceFeedback" role="status">Checking access…</p>';
  drawer.querySelector('#associateAvailableDetails')?.before(section);
  const box=section.querySelector('input'), status=section.querySelector('#teamPerformanceFeedback');
  const client=window.steadyHandsCRMClient;
  const {data,error}=await client.rpc('team_performance_access',{p_user_id:userId});
  if(ticket!==generation||drawer.dataset.userId!==userId||!section.isConnected)return;
  if(error){status.textContent='Unavailable: '+error.message+'. Apply the shared database migration first.';return;}
  box.checked=data===true;box.disabled=false;status.textContent='';
  box.addEventListener('change',async()=>{
   const desired=box.checked;
   box.disabled=true;status.textContent='Saving…';
   const result=await client.rpc('team_performance_set_access',{p_user_id:userId,p_allowed:desired});
   if(ticket!==generation||!section.isConnected)return;
   if(result.error||result.data!==true){box.checked=!desired;status.textContent='Could not save: '+(result.error?.message||'Permission was not updated');}
   else status.textContent=desired?'Team performance access granted.':'Team performance access revoked.';
   box.disabled=false;
  });
 });
})();