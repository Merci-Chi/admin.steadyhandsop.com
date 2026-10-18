/* Full associate data is loaded only for the selected, verified-admin drawer. */
(() => {
  let generation=0;
  const d=()=>window.SalesAssociateData;
  window.addEventListener('steadyhands:associate-open',async event=>{
    const {userId,user}=event.detail;
    const drawer=document.getElementById('adminUserDrawer');
    const slot=drawer.querySelector('#associateAvailableDetails');
    if(!slot)return;
    const request=++generation;
    slot.innerHTML='<p role="status">Loading available associate information…</p>';
    const c=window.steadyHandsCRMClient;
    const results=await Promise.allSettled([
      c.functions.invoke('admin-onboarding',{body:{action:'details',userId}}),
      c.from('outreach_associates').select('*').eq('user_id',userId).maybeSingle(),
      c.from('outreach_action_preferences').select('*').eq('user_id',userId).maybeSingle()
    ]);
    if(request!==generation||!slot.isConnected||drawer.dataset.userId!==userId)return;
    const payload=results[0].status==='fulfilled'&&!results[0].value.error&&!results[0].value.data?.error?results[0].value.data:null;
    let html=d().section('Profile',user);
    if(payload){
      for(const [key,title] of [['personalInformation','Personal information'],['workPreferences','Work preferences'],['paymentPreferences','Payment preferences'],['agreement','Agreement'],['progress','Onboarding progress'],['onboarding','Onboarding answers'],['training','Training'],['record','Additional records']]){
        if(payload[key]&&typeof payload[key]==='object')html+=d().section(title,payload[key]);
      }
    }else html+='<p class="sa-error" role="status">Some onboarding details could not be loaded.</p>';
    for(const [index,title] of [[1,'Current work agreement'],[2,'Latest questionnaire response']]){
      const result=results[index];
      if(result.status==='fulfilled'&&!result.value.error)html+=d().section(title,result.value.data);
    }
    slot.innerHTML=html;
  });
})();
