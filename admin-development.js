(() => {
 'use strict';
 const client=()=>window.steadyHandsCRMClient;
 const list=document.getElementById('developmentList');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let rows=[],handoffs=[],filter='all';
 const select=document.getElementById('developmentRecipientSelect');
 const recipientList=document.getElementById('developmentRecipientList');
 const recipientMessage=document.getElementById('developmentRecipientMessage');
 let availableRecipients=[];
 async function refreshRecipients(){
  if(!client()||!window.steadyHandsAdminSession)return;
  const {data,error}=await client().rpc('admin_developer_handoff_recipients');
  if(error){recipientMessage.textContent='Unable to load recipient settings: '+error.message;return;}
  availableRecipients=data||[];
  const selected=availableRecipients.filter(r=>r.is_recipient);
  recipientList.replaceChildren();
  for(const row of selected){
   const entry=document.createElement('div');entry.className='development-recipient-row';
   const name=document.createElement('span');name.textContent=(row.display_name||row.email||'Developer')+' · '+(row.email||'');
   const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';
   remove.addEventListener('click',()=>setRecipient(row.user_id,false));
   entry.append(name,remove);recipientList.append(entry);
  }
  if(!selected.length)recipientList.textContent='No developer recipients designated yet.';
  select.replaceChildren(new Option('Select a team member',''));
  for(const row of availableRecipients.filter(r=>!r.is_recipient)){
   select.add(new Option((row.display_name||row.email||'Developer')+' · '+(row.email||''),row.user_id));
  }
  document.getElementById('developmentRecipientAdd').disabled=!select.options.length||select.options.length===1;
 }
 async function setRecipient(userId,enabled){
  if(!userId)return;
  const add=document.getElementById('developmentRecipientAdd');
  add.disabled=true;recipientMessage.textContent='Saving recipient…';
  const {error}=await client().rpc('admin_set_developer_handoff_recipient',{p_user_id:userId,p_enabled:enabled});
  if(error){recipientMessage.textContent='Could not save: '+error.message;add.disabled=false;return;}
  recipientMessage.textContent=enabled?'Developer recipient added.':'Developer recipient removed.';
  await refreshRecipients();
 }
 document.getElementById('developmentRecipientAdd')?.addEventListener('click',()=>setRecipient(select.value,true));

 async function refresh(){
  if(!client()||!window.steadyHandsAdminSession)return;
  const {data,error}=await client().from('development_requests').select('*').order('created_at',{ascending:false}).limit(300);
  if(error){list.textContent='Unable to load development requests: '+error.message;return;}
  rows=data||[];
  const handoffResult=await client().rpc('admin_development_handoffs');
  if(handoffResult.error){document.getElementById('developmentHandoffs').textContent='Handoff inbox unavailable: '+handoffResult.error.message;}
  else {handoffs=handoffResult.data||[];renderHandoffs();}
  render();
 }
 function renderHandoffs(){
  const host=document.getElementById('developmentHandoffs');if(!host)return;
  const shown=handoffs.filter(h=>filter==='all'||(filter==='new'&&h.status==='pending')||(filter==='in_progress'&&h.status==='accepted'));
  host.innerHTML=shown.map(h=>`<article class="development-card"><div class="development-card-top"><strong>${esc(h.company||h.contact||'Prospect')}</strong><span>${esc(h.status==='pending'?'Pending recipient':'Acknowledged')}</span></div><p><b>Recipient:</b> ${esc(h.recipient_name||'Developer')}</p><p><b>Phone:</b> ${esc(h.phone||'')}</p><p><b>Notes:</b> ${esc(h.handoff_notes||'No notes')}</p><small>CRM ID: ${esc(h.crm_id)} · Shared ${esc(new Date(h.created_at).toLocaleString())}</small></article>`).join('')||'<p>No shared development leads in this filter.</p>';
 }
 function render(){renderHandoffs();
  const count=rows.filter(r=>!r.viewed_at&&r.status==='new').length;
  document.getElementById('developmentCount').textContent=count+' new alert'+(count===1?'':'s');
  const shown=rows.filter(r=>filter==='all'||r.status===filter);
  list.innerHTML=shown.map(r=>`<article class="development-card" data-id="${r.id}">
    <div class="development-card-top"><strong>${esc(r.company_name||'Prospect')}</strong><span>${!r.viewed_at&&r.status==='new'?'<b class="development-new">NEW</b> ':''}${esc(new Date(r.created_at).toLocaleString())}</span></div>
    <p><b>Phone:</b> ${esc(r.phone)}</p><p><b>Business needs:</b> ${esc(r.business_needs)}</p>
    <small>CRM ID: ${esc(r.crm_id)}</small>
    <div class="development-controls"><label>Status <select data-status="${r.id}">
      ${['new','in_progress','completed'].map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${({new:'New',in_progress:'In Progress',completed:'Completed'})[s]}</option>`).join('')}
    </select></label><button data-view="${r.id}" ${r.viewed_at?'disabled':''}>${r.viewed_at?'Viewed':'Mark viewed'}</button></div>
   </article>`).join('')||'<p>No development requests found.</p>';
 }
 async function update(id,patch){
  const {error}=await client().from('development_requests').update(patch).eq('id',id);
  if(error){alert('Could not update request: '+error.message);return;}
  await refresh();
 }
 document.querySelectorAll('[data-development-filter]').forEach(b=>b.addEventListener('click',()=>{
  filter=b.dataset.developmentFilter;
  document.querySelectorAll('[data-development-filter]').forEach(x=>x.classList.toggle('active',x===b));
  render();
 }));
 list.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)update(Number(b.dataset.view),{viewed_at:new Date().toISOString()})});
 list.addEventListener('change',e=>{const s=e.target.closest('[data-status]');if(s)update(Number(s.dataset.status),{status:s.value})});
 window.addEventListener('steadyhands:admin-ready',()=>{refresh();refreshRecipients();});
 if(window.steadyHandsAdminSession){refresh();refreshRecipients();}
 setInterval(()=>{if(!document.hidden)refresh()},20000);
})();