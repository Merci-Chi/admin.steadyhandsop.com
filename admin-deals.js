(() => {
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(c)||0)/100);
  const fmtDate=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});};
  let state={rows:[],users:[],q:'',user:'',status:''};

  function userLabel(id){const u=state.users.find(x=>String(x.user_id)===String(id));return u?.display_name||u?.email||'Unknown user';}
  function filtered(){const q=state.q.toLowerCase();return state.rows.filter(r=>(!state.user||String(r.user_id)===state.user)&&(!state.status||String(r.status)===state.status)&&(!q||[r.client_name,userLabel(r.user_id),r.status].join(' ').toLowerCase().includes(q)));}
  function renderSummary(){
    const rows=filtered();
    const sales=rows.reduce((s,r)=>s+(Number(r.sale_amount_cents)||0),0);
    const commission=rows.reduce((s,r)=>s+(Number(r.commission_amount_cents)||0),0);
    const complete=rows.filter(r=>r.status==='complete').length;
    document.getElementById('adminDealSummary').innerHTML='<div><strong>'+rows.length+'</strong><span>Deals</span></div><div><strong>'+money(sales)+'</strong><span>Sales value</span></div><div><strong>'+money(commission)+'</strong><span>Commission value</span></div><div><strong>'+complete+'</strong><span>Complete</span></div>';
    document.getElementById('adminDealCount').textContent=String(rows.length);
  }
  function render(){
    renderSummary();
    const list=document.getElementById('adminDealList'),rows=filtered();
    list.innerHTML=rows.length?rows.map(r=>'<button class="admin-finance-row" data-deal-id="'+esc(r.id)+'"><span class="admin-finance-icon"><i data-lucide="handshake"></i></span><span class="admin-finance-main"><strong>'+esc(r.client_name||'Client')+'</strong><small>'+esc(userLabel(r.user_id))+' · '+esc(fmtDate(r.created_at))+'</small><span><b>Sale '+money(r.sale_amount_cents)+'</b><b>Commission '+money(r.commission_amount_cents)+'</b></span></span><span class="admin-finance-status '+esc(r.status||'')+'">'+esc((r.status||'unknown').replace(/_/g,' '))+'</span><i data-lucide="chevron-right"></i></button>').join(''):'<div class="cc-empty">No deals match.</div>';
    list.querySelectorAll('[data-deal-id]').forEach(b=>b.onclick=()=>openDeal(b.dataset.dealId));
    window.lucide?.createIcons();
  }
  function openDeal(id){
    const r=state.rows.find(x=>String(x.id)===String(id));if(!r)return;
    const ov=document.getElementById('adminFinanceDrawerOverlay'),dr=document.getElementById('adminFinanceDrawer');
    dr.innerHTML='<div class="admin-user-drawer-head"><div><span class="admin-kicker">DEAL</span><h2>'+esc(r.client_name||'Client')+'</h2><p>'+esc(userLabel(r.user_id))+'</p></div><button id="closeFinanceDrawer"><i data-lucide="x"></i></button></div>'+
    '<div class="admin-lead-form-grid"><label class="full">Owner<select id="dealUser">'+state.users.map(u=>'<option value="'+esc(u.user_id)+'" '+(String(u.user_id)===String(r.user_id)?'selected':'')+'>'+esc(u.display_name||u.email||'User')+'</option>').join('')+'</select></label><label class="full">Client<input id="dealClient" value="'+esc(r.client_name||'')+'"></label><label>Sale amount ($)<input id="dealSale" type="number" step="0.01" value="'+((Number(r.sale_amount_cents)||0)/100).toFixed(2)+'"></label><label>Commission ($)<input id="dealCommission" type="number" step="0.01" value="'+((Number(r.commission_amount_cents)||0)/100).toFixed(2)+'"></label><label class="full">Status<select id="dealStatus"><option value="waiting_client_payment">Waiting on client payment</option><option value="pending">Pending</option><option value="complete">Complete</option></select></label></div>'+
    '<div class="admin-lead-actions"><button class="primary" id="saveDeal"><i data-lucide="save"></i>Save Deal</button><button class="danger" id="deleteDeal"><i data-lucide="trash-2"></i>Delete Deal</button></div><p class="admin-user-action-message" id="dealMessage"></p>';
    ov.hidden=false;dr.querySelector('#closeFinanceDrawer').onclick=()=>ov.hidden=true;dr.querySelector('#dealStatus').value=r.status||'waiting_client_payment';
    dr.querySelector('#saveDeal').onclick=async()=>{const msg=dr.querySelector('#dealMessage');msg.textContent='Saving…';const payload={user_id:dr.querySelector('#dealUser').value,client_name:dr.querySelector('#dealClient').value.trim(),sale_amount_cents:Math.round((Number(dr.querySelector('#dealSale').value)||0)*100),commission_amount_cents:Math.round((Number(dr.querySelector('#dealCommission').value)||0)*100),status:dr.querySelector('#dealStatus').value,updated_at:new Date().toISOString()};if(payload.status==='complete'&&!r.completed_at)payload.completed_at=new Date().toISOString();const {data,error}=await window.steadyHandsCRMClient.from('callcenter_commissions').update(payload).eq('id',r.id).select('*').single();if(error){msg.textContent=error.message;return;}Object.assign(r,data);msg.textContent='Deal saved.';render();};
    dr.querySelector('#deleteDeal').onclick=async()=>{if(!confirm('Permanently delete this deal and its commission record? This cannot be undone.'))return;const msg=dr.querySelector('#dealMessage');msg.textContent='Deleting…';const {error}=await window.steadyHandsCRMClient.from('callcenter_commissions').delete().eq('id',r.id);if(error){msg.textContent=error.message;return;}state.rows=state.rows.filter(x=>String(x.id)!==String(r.id));ov.hidden=true;render();};
    window.lucide?.createIcons();
  }
  async function load(){
    try{
      const c=window.steadyHandsCRMClient;const [a,b]=await Promise.all([c.from('callcenter_commissions').select('*').order('created_at',{ascending:false}).limit(10000),c.from('callcenter_profiles').select('user_id,display_name,email').order('display_name')]);if(a.error)throw a.error;if(b.error)throw b.error;state.rows=a.data||[];state.users=b.data||[];document.getElementById('adminDealUserFilter').innerHTML='<option value="">All users</option>'+state.users.map(u=>'<option value="'+esc(u.user_id)+'">'+esc(u.display_name||u.email||'User')+'</option>').join('');render();
    }catch(error){document.getElementById('adminDealList').innerHTML='<section class="admin-dashboard-error"><strong>Unable to load deals.</strong><p>'+esc(error?.message||'Please refresh.')+'</p></section>';}
  }
  document.getElementById('adminDealSearch')?.addEventListener('input',e=>{state.q=e.target.value||'';render();});document.getElementById('adminDealUserFilter')?.addEventListener('change',e=>{state.user=e.target.value||'';render();});document.getElementById('adminDealStatusFilter')?.addEventListener('change',e=>{state.status=e.target.value||'';render();});
  if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();