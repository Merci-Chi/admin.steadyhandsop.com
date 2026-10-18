(() => {
  'use strict';
  const $=id=>document.getElementById(id), d=()=>window.SalesAssociateData;
  let users=[],associates=[],assignments=[],preferences=[],history=[],ready=false,busy=false;
  const initialUser=new URLSearchParams(location.search).get('user');
  const basisName=value=>value==='hourly'?'Hourly wage':value==='commission'?'Commission + bonus':value;
  const time=minutes=>{const h=Math.floor(minutes/60);return `${h%12||12}:${String(minutes%60).padStart(2,'0')} ${h<12?'AM':'PM'}`;};
  const statusLabel=a=>a?.status==='assigned'?'Awaiting response':a?.status==='completed'?'Submitted':a?.status==='cancelled'?'Cancelled':'';
  function records(){
    const ids=new Set([...assignments,...preferences,...history].map(x=>String(x.user_id)));
    const userMap=new Map(users.map(x=>[x.user_id,x]));
    return [...ids].map(userId=>({userId,user:userMap.get(userId)||{user_id:userId},associate:associates.find(x=>x.user_id===userId),assignment:assignments.find(x=>x.user_id===userId),response:preferences.find(x=>x.user_id===userId),changes:history.filter(x=>x.user_id===userId)})).sort((a,b)=>d().userLabel(a.user).localeCompare(d().userLabel(b.user)));
  }
  function responseFields(p){
    if(!p)return {};
    return {'Selected path':basisName(p.selected_path),'Local timezone':p.local_timezone,'Work timezone':p.work_timezone,
      'Preferred window':p.shift_start_minutes==null?undefined:`${time(p.shift_start_minutes)} – ${time(p.shift_start_minutes+120)}`,
      'Preferred weekly hours':p.preferred_weekly_hours,'Quota acknowledged at':p.trial_quota_acknowledged_at,
      'Confirmed start date':p.confirmed_start_date,'Commission agreement requested':p.commission_agreement_requested,
      'First response saved':p.created_at,'Latest response saved':p.updated_at};
  }
  function render(){
    const all=records(),q=$('oa-search').value.trim().toLowerCase(),filter=$('oa-filter').value;
    const matched=all.filter(row=>{
      const matchesSearch=!q||JSON.stringify([row.user.display_name,row.user.email,row.response,row.associate]).toLowerCase().includes(q);
      const matchesFilter=filter==='all'||row.assignment?.status===filter||
        (filter==='completed'&&!row.assignment&&row.response)||
        (filter==='commission-request'&&row.response?.commission_agreement_requested===true)||
        (filter==='date-changed'&&row.changes.length);
      return matchesSearch&&matchesFilter;
    });
    $('oa-totals').innerHTML=[['Assigned',assignments.filter(x=>x.status==='assigned').length],['Submitted',preferences.length],['Agreement requests',preferences.filter(x=>x.commission_agreement_requested).length],['Start-date changes',history.length]].map(([label,n])=>`<span><strong>${n}</strong> ${label}</span>`).join('');
    $('oa-notice').textContent=`${matched.length} of ${all.length} associate outcomes`;
    $('oa-results').innerHTML=matched.map(row=>{
      const {userId,user,associate,assignment,response,changes}=row;
      const esc=d().esc;
      const currentResponse=response&&assignment&&assignment.status==='assigned'&&Date.parse(response.updated_at)<Date.parse(assignment.assigned_at);
      const status=statusLabel(assignment)||(response?'Submitted':'Start date changed');
      const changedRows=changes.map(x=>d().section('Start-date change',{'Previous date':x.previous_start_date,'New date':x.new_start_date,'Changed at':x.changed_at,'Changed by':d().userLabel(users.find(u=>u.user_id===x.changed_by)||{user_id:x.changed_by})})).join('');
      return `<details class="sa-result"><summary><span><strong>${esc(d().userLabel(user))}</strong>${associate?.current_basis?`<small>${esc(basisName(associate.current_basis))}${associate.start_date?' · Starts '+esc(associate.start_date):''}</small>`:''}</span><span class="sa-badge">${esc(status)}</span></summary><div class="sa-result-body">${d().section('Assignment',{Status:status,'Assigned at':assignment?.assigned_at,'Completed at':assignment?.completed_at})}${d().section('Current agreement',{'Agreement':basisName(associate?.current_basis),'Scheduled start date':associate?.start_date})}${currentResponse?'<p class="sa-save-warning">The response below was submitted before the current assignment. A new response is still pending.</p>':''}${d().section(currentResponse?'Previous response':'Questionnaire response',responseFields(response))}${changedRows}<a href="admin.html?user=${encodeURIComponent(userId)}">Overview</a><a href="onboarding.html?user=${encodeURIComponent(userId)}">Onboarding</a><a href="agreement-actions.html?user=${encodeURIComponent(userId)}">Agreement Actions</a>${assignment?.status==='assigned'?`<button type="button" data-cancel="${esc(userId)}">Cancel assignment</button>`:''}</div></details>`;
    }).join('')||'<p class="sa-empty">No matching outcomes.</p>';
  }
  function selectUser(){
    const record=associates.find(x=>x.user_id===$('oa-user').value);
    $('oa-basis').value=record?.current_basis||'';
    $('oa-date').value=record?.start_date||'';
    $('oa-date').required=$('oa-basis').value==='hourly';
  }
  async function load(){
    if(busy)return;
    ready=false;$('oa-assign').disabled=true;$('oa-refresh').disabled=true;
    $('oa-notice').textContent='Loading outcomes…';
    const c=window.steadyHandsCRMClient;
    try{
      const result=await Promise.all([
        d().readAll(c,'callcenter_profiles'),d().readAll(c,'team_permissions'),
        d().readAll(c,'outreach_associates'),d().readAll(c,'outreach_action_assignments'),
        d().readAll(c,'outreach_action_preferences'),d().readAll(c,'outreach_start_date_history','*','id'),
        c.rpc('sh_admin_agreement_actions')
      ]);
      const [profiles,permissions,associateRows,assignmentRows,responseRows,changeRows,directory]=result;
      users=d().mergeUsers(profiles,permissions,directory.error?[]:directory.data?.users||[]);
      associates=associateRows;assignments=assignmentRows;preferences=responseRows;history=changeRows;
      for(const a of associates)if(!users.some(u=>u.user_id===a.user_id))users.push({user_id:a.user_id});
      const previous=$('oa-user').value||initialUser;
      $('oa-user').innerHTML='<option value="">Choose an associate</option>'+users.map(u=>`<option value="${d().esc(u.user_id)}">${d().esc(d().userLabel(u))}</option>`).join('');
      $('oa-user').disabled=false;$('oa-user').value=users.some(u=>u.user_id===previous)?previous:'';
      selectUser();
      if(initialUser&&!$('oa-search').dataset.initialized){const u=users.find(x=>x.user_id===initialUser);$('oa-search').value=u?.email||u?.display_name||'';$('oa-search').dataset.initialized='true';}
      ready=true;render();
      if(directory.error)$('oa-notice').textContent+=' · Additional onboarding accounts could not be loaded.';
    }catch(error){
      $('oa-notice').textContent='Could not load actions: '+(error.message||String(error))+'. Apply the assigned-action questionnaire migration if setup is pending.';
      $('oa-results').innerHTML='';$('oa-totals').innerHTML='';
      $('oa-user').disabled=true;
    }finally{$('oa-refresh').disabled=false;$('oa-assign').disabled=!ready;}
  }
  $('oa-user').addEventListener('change',selectUser);
  $('oa-basis').addEventListener('change',()=>{$('oa-date').required=$('oa-basis').value==='hourly';});
  $('oa-search').addEventListener('input',()=>{if(ready)render();});$('oa-filter').addEventListener('change',()=>{if(ready)render();});$('oa-refresh').addEventListener('click',load);
  $('oa-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!ready||busy||!$('oa-form').reportValidity())return;
    const userId=$('oa-user').value,basis=$('oa-basis').value,date=$('oa-date').value;
    if(date&&![1,2,3,4,5].includes(new Date(date+'T12:00:00Z').getUTCDay())){$('oa-message').textContent='Choose a Monday–Friday start date.';return;}
    const old=assignments.find(x=>x.user_id===userId);
    if(old&&!confirm('Assign a new questionnaire to this associate? Any existing open questionnaire will be replaced.'))return;
    busy=true;$('oa-assign').disabled=true;$('oa-refresh').disabled=true;$('oa-message').textContent='Assigning…';
    try{
      const {data,error}=await window.steadyHandsCRMClient.rpc('outreach_admin_assign_action',{p_user_id:userId,p_current_basis:basis,p_start_date:date||null});
      if(error)throw error;if(!data)throw new Error('The database did not confirm the assignment.');
      $('oa-message').textContent='Questionnaire assigned to the associate’s Outreach Action Needed page.';
    }catch(error){$('oa-message').textContent='Assignment not confirmed: '+(error.message||String(error))+'. Refresh before trying again.';}
    finally{busy=false;await load();}
  });
  $('oa-results').addEventListener('click',async event=>{
    const button=event.target.closest('[data-cancel]');if(!button||busy)return;
    if(!confirm('Cancel this associate’s assigned questionnaire? Submitted responses and date-change history will remain.'))return;
    busy=true;button.disabled=true;
    try{const {error}=await window.steadyHandsCRMClient.rpc('outreach_admin_cancel_action',{p_user_id:button.dataset.cancel});if(error)throw error;$('oa-message').textContent='Assignment cancelled.';}
    catch(error){$('oa-message').textContent='Cancellation not confirmed: '+(error.message||String(error))+'. Refresh before trying again.';}
    finally{busy=false;await load();}
  });
  if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();
