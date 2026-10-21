(() => {
 'use strict';
 const client=()=>window.steadyHandsCRMClient;
 const list=document.getElementById('developmentList');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let rows=[],filter='all';
 async function refresh(){
  if(!client()||!window.steadyHandsAdminSession)return;
  const {data,error}=await client().from('development_requests').select('*').order('created_at',{ascending:false}).limit(300);
  if(error){list.textContent='Unable to load development requests: '+error.message;return;}
  rows=data||[];render();
 }
 function render(){
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
 window.addEventListener('steadyhands:admin-ready',refresh);
 if(window.steadyHandsAdminSession)refresh();
 setInterval(()=>{if(!document.hidden)refresh()},20000);
})();